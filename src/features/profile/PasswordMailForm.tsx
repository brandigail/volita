import { ExternalLink, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiRequestError } from '../../lib/api'
import { connectPasswordMail, type PasswordConnection } from '../../lib/mail-api'
import { presetFor } from '../../types/mail'

interface PasswordMailFormProps {
  provider: PasswordConnection['provider']
  initialEmail: string
  onConnected: () => void
  onBack: () => void
}

const domainOf = (email: string) => email.trim().toLowerCase().split('@')[1] ?? ''

/** Email address and app password for Yahoo, AOL, iCloud, Zoho, or (with server names) any business email. */
export function PasswordMailForm({ provider, initialEmail, onConnected, onBack }: PasswordMailFormProps) {
  const preset = presetFor(provider)
  const other = provider === 'other'
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [imapHost, setImapHost] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(465)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Most business email (cPanel and the like) uses mail.<your domain> for both, so that is offered until the person types.
  const guess = domainOf(email) ? `mail.${domainOf(email)}` : ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await connectPasswordMail({
        provider,
        email: email.trim(),
        password,
        ...(other ? { imap: { host: (imapHost || guess).trim(), port: 993 }, smtp: { host: (smtpHost || guess).trim(), port: smtpPort } } : {}),
      })
      setPassword('')
      onConnected()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not connect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-label={`Connect ${preset.label}`}>
      <p className="font-semibold">Connect {preset.label}</p>
      {preset.passwordSteps && (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {preset.passwordSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {preset.passwordUrl && (
        <a href={preset.passwordUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          <ExternalLink className="size-4" aria-hidden="true" />
          Open the {preset.label} app password page
        </a>
      )}
      <div>
        <label htmlFor="mail-email" className="mb-1.5 block text-sm font-semibold">
          Email address
        </label>
        <input id="mail-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
      </div>
      <div>
        <label htmlFor="mail-password" className="mb-1.5 block text-sm font-semibold">
          {other ? 'Email password (or app password)' : 'App password'}
        </label>
        <div className="relative">
          <input
            id="mail-password"
            type={shown ? 'text' : 'password'}
            required
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field pr-12"
          />
          <button
            type="button"
            onClick={() => setShown((value) => !value)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            className="muted absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg hover:text-(--ink)"
          >
            {shown ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        </div>
        {!other && <p className="muted mt-1 text-xs">Not your normal {preset.label} password: the app password made for Volita. You can cancel it there at any time.</p>}
      </div>
      {other && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="mail-imap" className="mb-1.5 block text-sm font-semibold">
              Incoming server (IMAP)
            </label>
            <input id="mail-imap" value={imapHost} placeholder={guess || 'mail.yourbusiness.co.za'} onChange={(e) => setImapHost(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="mail-smtp" className="mb-1.5 block text-sm font-semibold">
              Outgoing server (SMTP)
            </label>
            <input id="mail-smtp" value={smtpHost} placeholder={guess || 'mail.yourbusiness.co.za'} onChange={(e) => setSmtpHost(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="mail-smtp-port" className="mb-1.5 block text-sm font-semibold">
              Outgoing port
            </label>
            <select id="mail-smtp-port" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className="field">
              <option value={465}>465 (SSL)</option>
              <option value={587}>587 (STARTTLS)</option>
            </select>
          </div>
          <p className="muted self-end text-xs">Incoming always uses port 993 with SSL. Left empty, both servers are taken to be {guess || 'mail.yourbusiness.co.za'}.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-200">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Checking with your email…' : 'Connect'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
          Choose another
        </button>
      </div>
    </form>
  )
}
