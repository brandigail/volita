import { Loader2, MessagesSquare, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { UpgradeNote } from '../../components/UpgradeNote'
import { ApiRequestError, generateDraft } from '../../lib/api'
import { CHANNELS } from '../../lib/channels'
import { readChatScreenshots } from '../../lib/catchup-api'
import { shrinkImage } from '../../lib/image'
import { usePlan } from '../../providers/usePlan'
import { MAX_CHAT_IMAGES, chatAsText, type CatchUp } from '../../types/catchup'
import type { DraftCategory, GeneratedDraft } from '../../types/draft'
import { SpeechPlayer } from '../assistant/speech'
import { effectiveSpoken, effectiveWrite } from '../language/languageSettings'
import { addChat } from './chatStore'
import { ChatTranscript } from './ChatTranscript'

/** Screenshots are text, so they are kept sharper than photos; four of them still fit well under the upload limit. */
const MAX_SIDE = 1400
const JPEG_QUALITY = 0.7

interface CatchUpCardProps {
  onDraft: (draft: GeneratedDraft, transcript: string) => void
  onSeePlans: () => void
  /** Screenshots another app shared in (already shrunk), read straight away. */
  initialImages?: string[]
}

/** "Catch me up": pick screenshots of a WhatsApp chat, hear what it says, then say what to reply and get a draft. */
export function CatchUpCard({ onDraft, onSeePlans, initialImages }: CatchUpCardProps) {
  const { limits, refresh } = usePlan()
  const input = useRef<HTMLInputElement>(null)
  const player = useRef<SpeechPlayer | null>(null)
  const [catchUp, setCatchUp] = useState<CatchUp | null>(null)
  const [intent, setIntent] = useState('')
  const [category, setCategory] = useState<DraftCategory>('WHATSAPP')
  const [reading, setReading] = useState(false)
  const [writing, setWriting] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [showMessages, setShowMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState(false)
  const channels = CHANNELS.filter((channel) => limits.channels.includes(channel.id))

  useEffect(() => () => player.current?.stop(), [])

  const fail = useCallback((err: unknown, fallback: string) => {
    setUpgrade(err instanceof ApiRequestError && err.upgrade !== undefined)
    setError(err instanceof ApiRequestError ? err.message : fallback)
  }, [])

  /** Reads screenshots that are already small enough to send (JPEG data URLs, oldest first). */
  const read = useCallback(async (images: string[]) => {
    setReading(true)
    setError(null)
    setUpgrade(false)
    try {
      const reading = await readChatScreenshots(images)
      setCatchUp(reading)
      addChat(reading)
      setShowMessages(false)
      refresh()
    } catch (err) {
      fail(err, 'Could not read those screenshots. Try a clearer one.')
    } finally {
      setReading(false)
    }
  }, [fail, refresh])

  const choose = async (files: FileList | null) => {
    const picked = Array.from(files ?? []).slice(0, MAX_CHAT_IMAGES)
    if (picked.length === 0) return
    setReading(true)
    try {
      await read(await Promise.all(picked.map((file) => shrinkImage(file, MAX_SIDE, JPEG_QUALITY))))
    } catch {
      setReading(false)
      setError('Could not open those screenshots. Try another one.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  // Screenshots shared in from another app are read as soon as the card opens, once.
  const started = useRef(false)
  useEffect(() => {
    if (!initialImages?.length || started.current) return
    started.current = true
    void read(initialImages)
  }, [initialImages, read])

  const hear = () => {
    if (!catchUp) return
    player.current ??= new SpeechPlayer()
    if (speaking) {
      player.current.stop()
      setSpeaking(false)
      return
    }
    player.current.unlock()
    setSpeaking(true)
    void player.current
      .speak(catchUp.summary)
      .catch(() => undefined)
      .finally(() => setSpeaking(false))
  }

  const write = async () => {
    if (!catchUp) return
    player.current?.stop()
    setWriting(true)
    setError(null)
    setUpgrade(false)
    try {
      const wanted = intent.trim() || 'Reply helpfully to what they asked, and ask for anything you still need.'
      const instruction = `${chatAsText(catchUp)}\n\nWrite my next message to ${catchUp.contact || 'them'}. What I want to say: ${wanted}`
      const draft = await generateDraft(instruction, category, effectiveWrite(limits.anyLanguage), effectiveSpoken(limits.anyLanguage))
      onDraft(draft, intent.trim() || catchUp.summary)
      refresh()
    } catch (err) {
      fail(err, 'Could not write that. Please try again.')
    } finally {
      setWriting(false)
    }
  }

  const startOver = () => {
    player.current?.stop()
    setSpeaking(false)
    setCatchUp(null)
    setIntent('')
    setError(null)
    setUpgrade(false)
  }

  return (
    <div className="surface w-full p-4 text-left">
      <p className="text-sm font-semibold">
        Catch me up on a chat <span className="muted font-normal">(WhatsApp screenshots)</span>
      </p>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void choose(e.target.files)} />

      {!catchUp && (
        <>
          <p className="muted mt-1 text-sm">Take a screenshot of the chat (up to {MAX_CHAT_IMAGES}), and Volita tells you what they said and what they want.</p>
          <button type="button" disabled={reading} onClick={() => input.current?.click()} className="btn btn-ghost mt-3">
            {reading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MessagesSquare className="size-4" aria-hidden="true" />}
            {reading ? 'Reading the chat…' : 'Choose screenshots'}
          </button>
        </>
      )}

      {catchUp && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="rounded-2xl bg-brand-500/10 p-3 text-sm">
            <p className="font-semibold">{catchUp.contact || 'This chat'}{catchUp.needsReply ? ' is waiting for your reply' : ''}</p>
            <p className="mt-1">{catchUp.summary}</p>
            {catchUp.asked.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {catchUp.asked.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={hear} className="btn btn-ghost">
                {speaking ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
                {speaking ? 'Stop' : 'Read it to me'}
              </button>
              <button type="button" onClick={() => setShowMessages((open) => !open)} aria-expanded={showMessages} className="btn btn-ghost">
                {showMessages ? 'Hide the messages' : 'Show the messages'}
              </button>
            </div>
          </div>
          {showMessages && <ChatTranscript catchUp={catchUp} />}

          <label htmlFor="catchup-intent" className="text-sm font-semibold">
            What do you want to say?
          </label>
          <textarea
            id="catchup-intent"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            rows={3}
            maxLength={1000}
            className="field resize-y"
            placeholder="For example: tell her I can start Monday and the price is R4,500"
          />
          <label htmlFor="catchup-channel" className="text-sm font-semibold">
            Reply by
          </label>
          <select id="catchup-channel" value={category} onChange={(e) => setCategory(e.target.value as DraftCategory)} className="field">
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={startOver} className="btn btn-ghost">
              Another chat
            </button>
            <button type="button" onClick={() => void write()} disabled={writing} className="btn btn-primary">
              {writing ? 'Writing…' : 'Write my reply'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3">
          {upgrade ? <UpgradeNote message={error} needs="basic" onSeePlans={onSeePlans} /> : <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
