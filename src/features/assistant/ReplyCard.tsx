import { MessageCircle, X } from 'lucide-react'
import type { UsePendingReply } from './usePendingReply'

/**
 * A WhatsApp reply waiting for the person's say-so. It shows exactly what will be put into WhatsApp. Nothing is sent from
 * here: the button (or "send it") opens WhatsApp with the words filled in, and the person presses Send there.
 */
export function ReplyCard({ reply }: { reply: UsePendingReply }) {
  const { pending, busy, needsTap, direct } = reply
  if (!pending) return null
  const { draft, who } = pending

  return (
    <div className="surface w-full max-w-md space-y-3 p-4 text-left" role="group" aria-labelledby="reply-card-heading" data-testid="reply-card">
      <h2 id="reply-card-heading" className="flex items-center gap-2 text-sm font-extrabold">
        <MessageCircle className="size-4 text-brand-400" aria-hidden="true" />
        WhatsApp to {who}, waiting for your OK
      </h2>
      {needsTap && (
        <p role="alert" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs font-semibold text-amber-800 dark:text-amber-200">
          Tap Open WhatsApp: a browser only lets a tap open another app.
        </p>
      )}
      <p className="max-h-64 overflow-y-auto rounded-xl border border-(--line) p-3 text-sm leading-relaxed whitespace-pre-wrap">{draft.body}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void reply.open()}>
          <MessageCircle className="size-4" aria-hidden="true" />
          {direct ? 'Send on WhatsApp' : 'Open WhatsApp'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void reply.cancel()}>
          <X className="size-4" aria-hidden="true" />
          Cancel
        </button>
      </div>
      <p className="muted text-xs">{direct ? 'Say “send it” and I will send it on WhatsApp, or tell me what to change.' : 'Say “send it” to open WhatsApp, or tell me what to change. You still press Send in WhatsApp.'}</p>
    </div>
  )
}
