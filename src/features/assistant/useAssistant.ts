import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError, transcribeRecording } from '../../lib/api'
import { askAssistant } from '../../lib/assistant-api'
import { authClient } from '../../lib/auth-client'
import { startBackgroundListening, stopBackgroundListening } from '../../lib/native-listening'
import type { AssistantAction, AssistantTurn } from '../../types/assistant'
import { usePlan } from '../../providers/usePlan'
import { effectiveSpoken } from '../language/languageSettings'
import { Listener, ScreenLock, type Utterance } from './listener'
import { classifyApproval } from './approval'
import { SpeechPlayer } from './speech'
import { chatsForAssistant } from '../catchup/chatStore'
import { usePendingEmail, type UsePendingEmail } from './usePendingEmail'
import { usePendingReply, type UsePendingReply } from './usePendingReply'

export type AssistantPhase = 'idle' | 'starting' | 'listening' | 'hearing' | 'thinking' | 'speaking'

export interface ChatLine {
  id: number
  role: 'user' | 'assistant'
  text: string
  actions: AssistantAction[]
}

/** Spoken when driving mode starts. It is not one of the recorded clips, so it is generated or spoken by the device. */
const DRIVING_GREETING = 'Driving mode is on. Say catch me up, or tell me who to message. I will ask before anything is sent.'

/** The assistant is shown the last few turns only, which keeps replies fast and the request small. */
const HISTORY_TURNS = 8

interface Session {
  id: number
  /** Groups this conversation's turns in the saved history. */
  conversationId: string
  listener: Listener
  player: SpeechPlayer
  lock: ScreenLock
  history: AssistantTurn[]
}

function messageFrom(err: unknown): string {
  return err instanceof ApiRequestError || err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

export interface UseAssistant {
  phase: AssistantPhase
  lines: ChatLine[]
  error: string | null
  /** Attach to the element that shows the orb; its `--level` CSS variable follows the microphone. */
  orbRef: React.RefObject<HTMLDivElement | null>
  /** Tap on the orb: start, "I'm done talking", or interrupt, depending on what is happening. */
  tapOrb: () => void
  end: () => void
  clear: () => void
  /** The email waiting for approval, with the buttons that send or cancel it. */
  email: UsePendingEmail
  /** The WhatsApp reply waiting for approval, with the buttons that open WhatsApp or cancel it. */
  reply: UsePendingReply
}

/** Driving mode: the assistant keeps replies short and confirms every send out loud. */
export interface AssistantOptions {
  driving?: boolean
}

export function useAssistant({ driving = false }: AssistantOptions = {}): UseAssistant {
  const { limits, refresh } = usePlan()
  const anyLanguage = limits.anyLanguage
  const [phase, setPhase] = useState<AssistantPhase>('idle')
  const [lines, setLines] = useState<ChatLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const orbRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const nextIdRef = useRef(1)
  const email = usePendingEmail(limits.email)
  const { send: sendEmail, cancel: cancelEmail, refresh: refreshEmail } = email
  const pendingReply = usePendingReply()
  const { show: showReply, open: openReply, cancel: cancelReply } = pendingReply
  /** Whether a reply is waiting, and which kind of thing the assistant prepared last, for the spoken "send it". */
  const replyWaitingRef = useRef(false)
  const lastReadyRef = useRef<'email' | 'reply' | null>(null)
  /** The email waiting for approval, readable from callbacks that outlive a render. */
  const pendingRef = useRef(email.pending)
  /** True only straight after the assistant said an email is ready: that is when a bare "yes" may approve it. */
  const readyRef = useRef(false)
  useEffect(() => {
    pendingRef.current = email.pending
  }, [email.pending])
  useEffect(() => {
    replyWaitingRef.current = pendingReply.pending !== null
  }, [pendingReply.pending])

  /** A reply or recording that finishes after the user ended the session (or started a new one) is ignored. */
  const isCurrent = useCallback((session: Session) => sessionRef.current?.id === session.id, [])

  const addLine = useCallback((role: ChatLine['role'], text: string, actions: AssistantAction[] = []) => {
    setLines((current) => [...current, { id: nextIdRef.current++, role, text, actions }])
  }, [])

  const end = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    if (session) {
      session.listener.stop()
      session.player.stop()
      void session.lock.disable()
      void stopBackgroundListening()
    }
    setPhase('idle')
  }, [])

  useEffect(() => end, [end])

  const listenAgain = useCallback((session: Session) => {
    if (!isCurrent(session)) return
    session.listener.listen()
    setPhase('listening')
  }, [isCurrent])

  const speakReply = useCallback(
    async (session: Session, text: string, language?: string) => {
      if (!isCurrent(session)) return
      setPhase('speaking')
      session.player.startTurn(crypto.randomUUID())
      await session.player.speak(text, language)
    },
    [isCurrent],
  )

  /**
   * "Send it" or "cancel" said while an email is waiting. It is handled here, on the person's own words, and never by the
   * assistant, so nothing an email says can make it send. Returns false when the words were not an approval.
   */
  const handleApproval = useCallback(
    async (session: Session, text: string): Promise<boolean> => {
      const waiting = pendingRef.current
      // Whatever the assistant prepared last is what "send it" means when both an email and a reply are waiting.
      const target = replyWaitingRef.current && (lastReadyRef.current === 'reply' || !waiting) ? 'reply' : waiting ? 'email' : null
      const approval = target ? classifyApproval(text, readyRef.current) : null
      if (!target || !approval) return false
      setPhase('thinking')
      const outcome =
        target === 'reply'
          ? approval === 'send'
            ? await openReply()
            : await cancelReply()
          : waiting && approval === 'send'
            ? await sendEmail(waiting.id)
            : waiting
              ? await cancelEmail(waiting.id)
              : { ok: false, message: 'Nothing is waiting.' }
      readyRef.current = false
      if (!isCurrent(session)) return true
      session.history.push({ role: 'assistant', content: outcome.message })
      addLine('assistant', outcome.message)
      await speakReply(session, outcome.message)
      return true
    },
    [addLine, cancelEmail, cancelReply, isCurrent, openReply, sendEmail, speakReply],
  )

  const respond = useCallback(
    async (session: Session, text: string) => {
      addLine('user', text)
      session.history.push({ role: 'user', content: text })
      setPhase('thinking')
      try {
        if (await handleApproval(session, text)) {
          listenAgain(session)
          return
        }
        const reply = await askAssistant(session.history.slice(-HISTORY_TURNS), session.conversationId, effectiveSpoken(anyLanguage), { chats: chatsForAssistant(), driving })
        if (!isCurrent(session)) return
        session.history.push({ role: 'assistant', content: reply.reply, actions: reply.actions })
        addLine('assistant', reply.reply, reply.actions)
        const emailReady = reply.actions.some((a) => a.type === 'email_ready')
        const replyReady = reply.actions.find((a) => a.type === 'reply_ready')
        readyRef.current = emailReady || replyReady !== undefined
        if (emailReady) {
          lastReadyRef.current = 'email'
          void refreshEmail()
        }
        if (replyReady) {
          lastReadyRef.current = 'reply'
          void showReply(replyReady.id, replyReady.label.replace(/^WhatsApp to /, ''))
        }
        refresh()
        await speakReply(session, reply.reply, reply.speechLanguage)
      } catch (err) {
        if (!isCurrent(session)) return
        if (err instanceof ApiRequestError && err.status === 401) void authClient.signOut()
        setError(messageFrom(err))
        // A daily or per-minute cap won't clear by listening again, so stop and say why.
        if (err instanceof ApiRequestError && err.status === 429) {
          end()
          return
        }
      }
      listenAgain(session)
    },
    [addLine, anyLanguage, driving, end, handleApproval, isCurrent, listenAgain, refresh, refreshEmail, showReply, speakReply],
  )

  const handleUtterance = useCallback(
    async (session: Session, utterance: Utterance) => {
      setPhase('thinking')
      try {
        const text = await transcribeRecording(utterance.segments, utterance.mimeType, effectiveSpoken(anyLanguage), true)
        if (!isCurrent(session)) return
        if (text) {
          setError(null)
          await respond(session, text)
          return
        }
      } catch (err) {
        if (!isCurrent(session)) return
        if (err instanceof ApiRequestError && err.status === 401) void authClient.signOut()
        setError(messageFrom(err))
        if (err instanceof ApiRequestError && err.status === 429) {
          end()
          return
        }
      }
      listenAgain(session)
    },
    [anyLanguage, end, isCurrent, listenAgain, respond],
  )

  const start = useCallback(async () => {
    if (sessionRef.current) return
    setError(null)
    setPhase('starting')

    const player = new SpeechPlayer()
    player.unlock()
    const lock = new ScreenLock()
    let session: Session | null = null
    const listener = new Listener({
      onLevel: (level) => orbRef.current?.style.setProperty('--level', level.toFixed(3)),
      onHearing: (hearing) =>
        setPhase((current) => (current === 'listening' || current === 'hearing' ? (hearing ? 'hearing' : 'listening') : current)),
      onUtterance: (utterance) => session && void handleUtterance(session, utterance),
      onIdleTimeout: () => {
        setError('I stopped listening because it has been quiet for a while. Tap the orb when you are ready.')
        end()
      },
      onInterrupted: () => {
        setError('Listening was interrupted, for example by locking the screen or a phone call. Tap the orb to start again.')
        end()
      },
      onError: (message) => {
        setError(message)
        if (session) listenAgain(session)
      },
    })

    try {
      await listener.start()
    } catch (err) {
      setError(messageFrom(err))
      setPhase('idle')
      return
    }

    session = { id: Date.now(), conversationId: crypto.randomUUID(), listener, player, lock, history: [] }
    sessionRef.current = session
    void lock.enable()
    // In the Android app this keeps the microphone alive with the screen off; in a browser it does nothing.
    void startBackgroundListening()

    // The usual line is fixed, so a recording of it plays at once instead of waiting for the voice service.
    const greeting = driving ? DRIVING_GREETING : "Hi, I'm listening. What can I do for you?"
    addLine('assistant', greeting)
    setPhase('speaking')
    session.player.startTurn(crypto.randomUUID())
    if (driving) await session.player.speak(greeting)
    else await session.player.speakGreeting(greeting)
    listenAgain(session)
  }, [addLine, driving, end, handleUtterance, listenAgain])

  const tapOrb = useCallback(() => {
    const session = sessionRef.current
    if (!session) {
      if (phase === 'idle') void start()
      return
    }
    if (phase === 'hearing') session.listener.finishNow()
    else if (phase === 'speaking') session.player.stop() // speakReply resolves and listening resumes
  }, [phase, start])

  const clear = useCallback(() => setLines([]), [])

  return { phase, lines, error, orbRef, tapOrb, end, clear, email, reply: pendingReply }
}
