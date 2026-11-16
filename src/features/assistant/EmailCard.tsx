import { AlertTriangle, Mail, Send, X } from 'lucide-react'
import type { UsePendingEmail } from './usePendingEmail'

/**
 * An email waiting for the person's say-so. It shows exactly who it goes to and what it says, because that is what will
 * be sent. Nothing leaves until Send is tapped (or "send it" is said).
 */
export function EmailCard({ email }: { email: UsePendingEmail }) {
  const { pending, busy, notice } = email
  if (!pending && !notice) return null

  return (
    <div className="w-full max-w-md text-left" data-testid="email-card">
      {pending && (
        <div className="surface space-y-3 p-4" role="group" aria-labelledby="email-card-heading">
          <h2 id="email-card-heading" className="flex items-center gap-2 text-sm font-extrabold">
            <Mail className="size-4 text-brand-400" aria-hidden="true" />
            Email waiting for your OK
          </h2>
          {pending.differs && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              This address came up while reading an email. Check it is the person you meant before you send.
            </p>
          )}
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="muted w-14 shrink-0">To</dt>
              <dd className="font-semibold break-all">{pending.to}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="muted w-14 shrink-0">Subject</dt>
              <dd className="font-semibold">{pending.subject}</dd>
            </div>
          </dl>
          <p className="max-h-64 overflow-y-auto rounded-xl border border-(--line) p-3 text-sm leading-relaxed whitespace-pre-wrap">{pending.body}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void email.send(pending.id)}>
              <Send className="size-4" aria-hidden="true" />
              {busy ? 'Sending…' : 'Send'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void email.cancel(pending.id)}>
              <X className="size-4" aria-hidden="true" />
              Cancel
            </button>
          </div>
          <p className="muted text-xs">Say “send it” to send, or tell me what to change.</p>
        </div>
      )}
      {notice && (
        <p role={notice.error ? 'alert' : 'status'} className={`mt-2 rounded-xl px-3 py-2 text-sm font-semibold ${notice.error ? 'border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200' : 'text-emerald-700 dark:text-emerald-300'}`}>
          {notice.text}
        </p>
      )}
    </div>
  )
}
