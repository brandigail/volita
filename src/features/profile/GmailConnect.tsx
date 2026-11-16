import { History, Mail, ShieldCheck, Unplug } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { disconnectGmail, fetchGmailLog, fetchGmailStatus, GMAIL_CONNECT_URL } from '../../lib/gmail-api'
import type { GmailLogEntry, GmailStatus } from '../../types/gmail'

interface Message {
  text: string
  error: boolean
}

const RETURN_MESSAGES: Record<string, Message> = {
  connected: { text: 'Gmail is connected.', error: false },
  denied: { text: 'Nothing was connected, because you said no on Google’s screen.', error: true },
  scopes: { text: 'Volita needs both permissions (read and send). Connect again and leave both ticked.', error: true },
  plan: { text: 'Gmail is part of the Pro plan.', error: true },
  not_configured: { text: 'Gmail sign-in is not set up on this server yet.', error: true },
  failed: { text: 'The connection did not finish. Please try again.', error: true },
}

function describeLog(entry: GmailLogEntry): string {
  switch (entry.action) {
    case 'connect':
      return `Connected ${entry.detail}`
    case 'disconnect':
      return 'Disconnected Gmail'
    case 'search':
      return `Looked for “${entry.detail}”`
    case 'read':
      return `Read an email: ${entry.detail}`
    case 'prepare':
      return `Wrote an email for your approval: ${entry.detail}`
    case 'send':
      return `You sent an email: ${entry.detail}`
    case 'cancel':
      return 'You cancelled a waiting email'
  }
}

/** Connect or disconnect the person's Gmail, and see exactly what Volita has done with it. */
export function GmailConnect({ returnCode }: { returnCode?: string }) {
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<GmailLogEntry[] | null>(null)
  const [message, setMessage] = useState<Message | null>(returnCode ? (RETURN_MESSAGES[returnCode] ?? RETURN_MESSAGES.failed) : null)

  const load = useCallback(async () => {
    try {
      setStatus(await fetchGmailStatus())
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not check Gmail.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchGmailStatus()
      .then((next) => !cancelled && setStatus(next))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not check Gmail.'))
    return () => {
      cancelled = true
    }
  }, [])

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      await disconnectGmail()
      setConfirming(false)
      setLog(null)
      setMessage({ text: 'Gmail is disconnected. Volita’s saved permission was deleted and Google was told to forget it.', error: false })
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not disconnect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function showLog() {
    try {
      setLog(await fetchGmailLog())
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the record.')
    }
  }

  const needsConnect = status !== null && status.allowed && status.configured && (!status.connected || status.needsReconnect)

  return (
    <section aria-labelledby="gmail-heading" className="mt-10" id="gmail">
      <h2 id="gmail-heading" className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Mail className="size-6 text-brand-400" aria-hidden="true" />
        Gmail
      </h2>
      <p className="muted mt-1 mb-4 text-sm">
        Connect your Gmail and the assistant can find and read your emails when you ask, and write replies for you. Nothing is ever sent unless you tap Send or say “send it”.
      </p>

      <div className="surface space-y-4 p-5">
        {message && (
          <p role={message.error ? 'alert' : 'status'} className={`text-sm font-semibold ${message.error ? 'text-red-700 dark:text-red-200' : 'text-emerald-700 dark:text-emerald-300'}`}>
            {message.text}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-200">
            {error}
          </p>
        )}

        {!status && !error && <p className="muted text-sm">Checking…</p>}

        {status && !status.allowed && <p className="text-sm">Gmail is part of the Pro plan. Ask the owner of Volita to switch it on for you, or see the plans above.</p>}
        {status && status.allowed && !status.configured && <p className="text-sm">Gmail sign-in is not set up on this server yet.</p>}

        {status?.connected && !status.needsReconnect && (
          <p className="text-sm">
            Connected as <span className="font-semibold break-all">{status.email}</span>
            {status.connectedAt && <span className="muted"> since {new Date(status.connectedAt).toLocaleDateString()}</span>}.
          </p>
        )}
        {status?.connected && status.needsReconnect && (
          <p role="alert" className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Google has ended the connection to {status.email}. Connect again to carry on. While Volita is in testing, Google asks for this about once a week.
          </p>
        )}

        {needsConnect && (
          <>
            <a href={GMAIL_CONNECT_URL} className="btn btn-primary">
              <Mail className="size-4" aria-hidden="true" />
              {status.connected ? 'Connect again' : 'Connect Gmail'}
            </a>
            <p className="muted text-xs">
              Google will show a warning that “Google hasn’t verified this app”. That is expected while Volita is in testing: tap Advanced, then Continue. Leave both boxes ticked.
            </p>
          </>
        )}

        <ul className="muted space-y-1 text-xs">
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Volita asks Google only to read and send mail. It cannot delete, move or change anything.
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            An email is read only when you ask, and its text is not saved. It is sent to the AI service to be summarised or answered, then forgotten.
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Text inside an email is treated as information, never as orders.
          </li>
        </ul>

        {status?.connected && (
          <div className="flex flex-wrap gap-2 border-t border-(--line) pt-4">
            {log === null ? (
              <button type="button" className="btn btn-ghost" onClick={() => void showLog()}>
                <History className="size-4" aria-hidden="true" />
                What has Volita done with my email?
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setLog(null)}>
                Hide the record
              </button>
            )}
            {!confirming && (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
                <Unplug className="size-4" aria-hidden="true" />
                Disconnect Gmail
              </button>
            )}
          </div>
        )}

        {confirming && (
          <div role="alertdialog" aria-label="Confirm disconnect" className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="text-sm">This deletes Volita’s saved permission and tells Google to forget it. Emails you already sent stay sent. You can connect again later.</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void disconnect()}>
                {busy ? 'Disconnecting…' : 'Disconnect and delete'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </div>
          </div>
        )}

        {log !== null && (
          <div>
            {log.length === 0 ? (
              <p className="muted text-sm">Nothing yet.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto text-sm" aria-label="Gmail record">
                {log.map((entry) => (
                  <li key={entry.id} className="border-b border-(--line) pb-2">
                    <p>{describeLog(entry)}</p>
                    <p className="muted text-xs">{new Date(entry.createdAt).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
