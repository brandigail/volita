import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { cancelPendingEmail, fetchPendingEmail, sendPendingEmail } from '../../lib/gmail-api'
import type { PendingEmail } from '../../types/gmail'

export interface EmailNotice {
  text: string
  error: boolean
}

export interface SendOutcome {
  ok: boolean
  /** Worded so it can be read out as well as shown. */
  message: string
}

export interface UsePendingEmail {
  pending: PendingEmail | null
  busy: boolean
  notice: EmailNotice | null
  refresh: () => Promise<void>
  send: (id: string) => Promise<SendOutcome>
  cancel: (id: string) => Promise<SendOutcome>
}

/**
 * The email the assistant has written and is waiting for the person to approve. Sending happens only through `send`,
 * which the Send button and the spoken "send it" both call, for the exact email the person was shown.
 */
export function usePendingEmail(enabled: boolean): UsePendingEmail {
  const [pending, setPending] = useState<PendingEmail | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<EmailNotice | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPending(await fetchPendingEmail())
    } catch {
      // keep showing what we have; the next refresh will try again
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchPendingEmail()
      .then((next) => !cancelled && setPending(next))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled])

  const send = useCallback(
    async (id: string): Promise<SendOutcome> => {
      setBusy(true)
      setNotice(null)
      try {
        const { to } = await sendPendingEmail(id)
        setPending(null)
        const message = `Sent to ${to}.`
        setNotice({ text: message, error: false })
        return { ok: true, message }
      } catch (err) {
        const message = err instanceof ApiRequestError ? err.message : 'The email could not be sent. Please try again.'
        setNotice({ text: message, error: true })
        // A 409 means it is no longer waiting (already sent, cancelled or expired), so stop showing it.
        if (err instanceof ApiRequestError && err.status === 409) await refresh()
        return { ok: false, message }
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const cancel = useCallback(async (id: string): Promise<SendOutcome> => {
    setBusy(true)
    setNotice(null)
    try {
      await cancelPendingEmail(id)
      setPending(null)
      const message = 'Okay, I have cancelled that email. Nothing was sent.'
      setNotice({ text: message, error: false })
      return { ok: true, message }
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : 'That could not be cancelled. Please try again.'
      setNotice({ text: message, error: true })
      return { ok: false, message }
    } finally {
      setBusy(false)
    }
  }, [])

  return { pending, busy, notice, refresh, send, cancel }
}
