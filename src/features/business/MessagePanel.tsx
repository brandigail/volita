import { Copy, Loader2, Mail, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import type { BusinessMessage } from '../../lib/business-messages'
import { mailtoLink, whatsAppLink } from '../../lib/invoice-text'

interface MessagePanelProps {
  heading: string
  /** One line on why this message is being offered. */
  why: string
  message: BusinessMessage
  phone: string
  email: string
  /** When given, a button that records the message as sent. */
  confirmLabel?: string
  onConfirm?: () => Promise<void>
}

/** A ready-written message the owner can read, edit and send from their own WhatsApp or mail. Nothing is sent by Volita. */
export function MessagePanel({ heading, why, message, phone, email, confirmLabel, onConfirm }: MessagePanelProps) {
  const [body, setBody] = useState(message.body)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      setNote('Copied.')
    } catch {
      setNote('Could not copy. Press and hold the text to select it.')
    }
  }
  const confirm = async () => {
    if (!onConfirm) return
    setBusy(true)
    try {
      await onConfirm()
    } catch {
      setNote('Could not record that. Please try again.')
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4" aria-label={heading}>
      <h3 className="font-extrabold">{heading}</h3>
      <p className="text-sm">{why}</p>
      <label htmlFor={`msg-${heading}`} className="sr-only">
        Message
      </label>
      <textarea id={`msg-${heading}`} className="field min-h-44 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {phone && (
          <a href={whatsAppLink(phone, body)} target="_blank" rel="noopener noreferrer" className="btn btn-channel">
            <MessageCircle className="size-4" aria-hidden="true" />
            WhatsApp it
          </a>
        )}
        {email && (
          <a href={mailtoLink(email, message.subject, body)} className="btn btn-channel">
            <Mail className="size-4" aria-hidden="true" />
            Email it
          </a>
        )}
        <button type="button" onClick={() => void copy()} className="btn btn-ghost">
          <Copy className="size-4" aria-hidden="true" />
          Copy
        </button>
      </div>
      {confirmLabel && onConfirm && (
        <button type="button" onClick={() => void confirm()} disabled={busy} className="btn btn-primary self-start">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {confirmLabel}
        </button>
      )}
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
    </section>
  )
}
