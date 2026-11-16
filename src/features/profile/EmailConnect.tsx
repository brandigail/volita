import { History, Mail, ShieldCheck, Unplug } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { fetchGmailLog } from '../../lib/gmail-api'
import { GMAIL_CONNECT_URL, OUTLOOK_CONNECT_URL, disconnectMail, fetchMailStatus, type PasswordConnection } from '../../lib/mail-api'
import { usePlan } from '../../providers/usePlan'
import type { GmailLogEntry } from '../../types/gmail'
import { presetFor, type MailProviderId, type MailStatus } from '../../types/mail'
import { StartTrialButton } from '../plan/StartTrialButton'
import { EmailLog } from './EmailLog'
import { MailProviderChoice } from './MailProviderChoice'
import { PasswordMailForm } from './PasswordMailForm'

interface Message {
  text: string
  error: boolean
}

/** Codes the server puts in the address after a Google or Microsoft sign-in. */
const RETURN_MESSAGES: Record<string, Message> = {
  connected: { text: 'Your email is connected.', error: false },
  denied: { text: 'Nothing was connected, because you said no on the sign-in screen.', error: true },
  scopes: { text: 'Volita needs both permissions (read and send). Connect again and allow both.', error: true },
  plan: { text: 'Connecting your email is part of the Pro plan.', error: true },
  not_configured: { text: 'That sign-in is not set up on this server yet.', error: true },
  failed: { text: 'The connection did not finish. Please try again.', error: true },
}

type PasswordProvider = PasswordConnection['provider']
const isPasswordProvider = (id: MailProviderId | null): id is PasswordProvider => id !== null && presetFor(id).kind === 'password'

/** Connect the person's email (Gmail, Outlook, Yahoo, AOL, iCloud, Zoho or business email) and see what Volita did with it. */
export function EmailConnect({ returnCode }: { returnCode?: string }) {
  const [status, setStatus] = useState<MailStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(returnCode ? (RETURN_MESSAGES[returnCode] ?? RETURN_MESSAGES.failed) : null)
  const [choosing, setChoosing] = useState<PasswordProvider | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<GmailLogEntry[] | null>(null)
  // The plan can change while this card is open (a free trial starts), so the status is read again when it does.
  const planId = usePlan().state?.plan

  const load = useCallback(async () => {
    try {
      setStatus(await fetchMailStatus())
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not check your email connection.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMailStatus()
      .then((next) => !cancelled && setStatus(next))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not check your email connection.'))
    return () => {
      cancelled = true
    }
  }, [planId])

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      await disconnectMail()
      setConfirming(false)
      setLog(null)
      setMessage({ text: 'Your email is disconnected. Volita deleted its saved permission or password.', error: false })
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

  const label = status?.provider ? presetFor(status.provider).label : 'your email'
  const live = status?.connected === true && !status.needsReconnect
  const reconnectHref = status?.provider === 'gmail' ? GMAIL_CONNECT_URL : status?.provider === 'outlook' ? OUTLOOK_CONNECT_URL : null

  return (
    <section aria-labelledby="email-heading" className="mt-10" id="email">
      <h2 id="email-heading" className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Mail className="size-6 text-brand-400" aria-hidden="true" />
        Your email
      </h2>
      <p className="muted mt-1 mb-4 text-sm">
        Connect your email (Gmail, Outlook, Yahoo, AOL, iCloud or your business email) and the assistant can find and read your emails when you ask, and write replies for you. Nothing is ever sent
        unless you tap Send or say “send it”.
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

        {status && !status.allowed && (
          <div className="space-y-3">
            <p className="text-sm">Connecting your email is part of the Pro plan. You can try it free, or see the plans above.</p>
            <StartTrialButton />
          </div>
        )}

        {live && (
          <p className="text-sm">
            Connected to {label} as <span className="font-semibold break-all">{status.email}</span>
            {status.connectedAt && <span className="muted"> since {new Date(status.connectedAt).toLocaleDateString()}</span>}.
          </p>
        )}
        {status?.connected && status.needsReconnect && (
          <div className="space-y-3">
            <p role="alert" className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              The connection to {status.email} has stopped working ({label} ended it, or the app password was changed). Connect again to carry on.
            </p>
            {reconnectHref ? (
              <a href={reconnectHref} className="btn btn-primary">
                Connect again
              </a>
            ) : (
              isPasswordProvider(status.provider) &&
              choosing === null && (
                <button type="button" className="btn btn-primary" onClick={() => setChoosing(status.provider as PasswordProvider)}>
                  Enter a new app password
                </button>
              )
            )}
          </div>
        )}

        {status?.allowed && !status.connected && choosing === null && <MailProviderChoice status={status} onChoose={(id) => isPasswordProvider(id) && setChoosing(id)} />}
        {status?.allowed && choosing !== null && (
          <PasswordMailForm
            provider={choosing}
            initialEmail={status.email ?? ''}
            onBack={() => setChoosing(null)}
            onConnected={() => {
              setChoosing(null)
              setMessage({ text: `${presetFor(choosing).label} is connected.`, error: false })
              void load()
            }}
          />
        )}
        {status?.provider === 'gmail' && live && <p className="muted text-xs">While Volita is in testing, Google asks you to connect Gmail again about once a week.</p>}

        <ul className="muted space-y-1 text-xs">
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Volita only reads and sends mail. It never deletes, moves or changes anything, and it does not mark emails as read.
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            An email is read only when you ask, and its text is not saved. Your sign-in or app password is stored encrypted, and disconnecting deletes it.
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Text inside an email is treated as information, never as orders.
          </li>
        </ul>

        {status?.connected && (
          <div className="flex flex-wrap gap-2 border-t border-(--line) pt-4">
            <button type="button" className="btn btn-ghost" onClick={() => (log === null ? void showLog() : setLog(null))}>
              <History className="size-4" aria-hidden="true" />
              {log === null ? 'What has Volita done with my email?' : 'Hide the record'}
            </button>
            {!confirming && (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
                <Unplug className="size-4" aria-hidden="true" />
                Disconnect {label}
              </button>
            )}
          </div>
        )}
        {confirming && (
          <div role="alertdialog" aria-label="Confirm disconnect" className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="text-sm">This deletes Volita’s saved permission or app password. Emails you already sent stay sent. You can connect again later.</p>
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
        {log !== null && <EmailLog entries={log} />}
      </div>
    </section>
  )
}
