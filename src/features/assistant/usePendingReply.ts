import { useCallback, useRef, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { deleteDraft, listDrafts, markDraftSent } from '../../lib/drafts-api'
import { nativeInbox } from '../../lib/native-inbox'
import { isAndroidApp, openInstalledApp } from '../../lib/native-listening'
import { buildWhatsAppUrl } from '../../lib/share'
import type { Draft } from '../../types/draft'

const WHATSAPP_PACKAGES = ['com.whatsapp', 'com.whatsapp.w4b'] as const

export interface ReplyOutcome {
  ok: boolean
  /** Worded so it can be read out as well as shown. */
  message: string
}

export interface UsePendingReply {
  /** The reply waiting for the person's say-so, and who it is for. */
  pending: { draft: Draft; who: string } | null
  /** True when "send it" can send the reply through WhatsApp's own Reply button, without opening WhatsApp at all. */
  direct: boolean
  /** Set when WhatsApp could not be opened by voice, so the card asks for a tap. */
  needsTap: boolean
  busy: boolean
  /** Shows the reply the assistant just wrote. */
  show: (id: string, who: string) => Promise<void>
  /** Sends the reply on WhatsApp if the chat's Reply button is available, otherwise opens WhatsApp with the words filled in for the person to send. */
  open: () => Promise<ReplyOutcome>
  /** Drops the card. The draft stays in History unless `discard` is true. */
  cancel: (discard?: boolean) => Promise<ReplyOutcome>
}

/** Opens a link in a new tab; false when the browser blocked it because it did not start from a tap. */
function openWindow(url: string): boolean {
  const opened = window.open(url, '_blank')
  if (!opened) return false
  opened.opener = null
  return true
}

/**
 * The WhatsApp reply the assistant has written and is waiting for the person to approve. WhatsApp is opened only through
 * `open`, which the button and the spoken "send it" both call, and even then WhatsApp waits for the person to press Send.
 */
export function usePendingReply(): UsePendingReply {
  const [pending, setPending] = useState<{ draft: Draft; who: string } | null>(null)
  const [needsTap, setNeedsTap] = useState(false)
  const [direct, setDirect] = useState(false)
  const [busy, setBusy] = useState(false)
  /** What `open` should act on, readable from callbacks that outlive a render. */
  const current = useRef<{ draft: Draft; who: string } | null>(null)

  const show = useCallback(async (id: string, who: string) => {
    try {
      const { drafts } = await listDrafts()
      const draft = drafts.find((item) => item.id === id)
      current.current = draft ? { draft, who } : null
      setPending(current.current)
      setNeedsTap(false)
      setDirect(draft ? await nativeInbox.canReply(who) : false)
    } catch {
      // The reply is still saved in History; the card just could not be drawn.
    }
  }, [])

  const open = useCallback(async (): Promise<ReplyOutcome> => {
    const waiting = current.current
    if (!waiting) return { ok: false, message: 'There is no reply waiting.' }
    setBusy(true)
    try {
      // When the chat's own Reply button is available, the message is sent from here and WhatsApp stays closed.
      if ((await nativeInbox.canReply(waiting.who)) && (await nativeInbox.sendReply(waiting.who, waiting.draft.body))) {
        await markDraftSent(waiting.draft.id, true).catch(() => undefined)
        current.current = null
        setPending(null)
        setDirect(false)
        return { ok: true, message: `Sent to ${waiting.who} on WhatsApp.` }
      }
      const url = buildWhatsAppUrl(waiting.draft)
      // In the Android app the phone itself opens WhatsApp, which needs no tap. A browser only opens a tab straight after a tap.
      const opened = isAndroidApp ? await openInstalledApp(url, WHATSAPP_PACKAGES) : openWindow(url)
      if (!opened) {
        setNeedsTap(true)
        return { ok: false, message: 'I could not open WhatsApp by voice on this phone. Please tap the Open WhatsApp button on the screen.' }
      }
      current.current = null
      setPending(null)
      setNeedsTap(false)
      return { ok: true, message: `WhatsApp is open with your message to ${waiting.who}. Press send in WhatsApp when you are ready.` }
    } finally {
      setBusy(false)
    }
  }, [])

  const cancel = useCallback(async (discard = false): Promise<ReplyOutcome> => {
    const waiting = current.current
    current.current = null
    setPending(null)
    setNeedsTap(false)
    setDirect(false)
    if (waiting && discard) {
      try {
        await deleteDraft(waiting.draft.id)
      } catch (err) {
        return { ok: false, message: err instanceof ApiRequestError ? err.message : 'I could not remove that draft.' }
      }
    }
    return { ok: true, message: 'Okay, I have put that to one side. Nothing was sent.' }
  }, [])

  return { pending, direct, needsTap, busy, show, open, cancel }
}
