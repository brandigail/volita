import { ArrowLeft, FileDown, Loader2, Mail, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { deleteInvoice, patchInvoice } from '../../lib/business-api'
import { authClient } from '../../lib/auth-client'
import { buildInvoicePdf } from '../../lib/invoice-pdf'
import { invoiceMessage, mailtoLink, prettyDate, whatsAppLink } from '../../lib/invoice-text'
import { chaserMessage, reviewMessage } from '../../lib/business-messages'
import { CHASE_AFTER_DAYS, daysBetween, formatRand, lineCents, nextChase } from '../../lib/money'
import { profileFromUser } from '../../lib/profile'
import { deliverPdf } from '../../lib/quote-pdf'
import type { BusinessSettings, Invoice, InvoiceStatus } from '../../types/business'
import { todayLocal } from './dates'
import { lookOf, STATUS_LOOK } from './invoiceLook'
import { JobSheet } from './JobSheet'
import { MessagePanel } from './MessagePanel'

interface InvoiceDetailProps {
  invoice: Invoice
  settings: BusinessSettings
  onChange: (invoice: Invoice) => void
  onDeleted: (id: string) => void
  onBack: () => void
}

/** One invoice: what it says, how to send it, and moving it from draft to sent to paid. */
export function InvoiceDetail({ invoice, settings, onChange, onDeleted, onBack }: InvoiceDetailProps) {
  const { data: session } = authClient.useSession()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = todayLocal()
  const look = STATUS_LOOK[lookOf(invoice, today)]
  const profile = session ? profileFromUser(session.user) : null
  const message = profile ? invoiceMessage(invoice, profile) : ''

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'That did not work. Please try again.')
    } finally {
      setBusy(null)
    }
  }
  const move = (status: InvoiceStatus) => run(status, async () => onChange(await patchInvoice(invoice.id, { status })))
  const pdf = () =>
    run('pdf', async () => {
      if (profile) await deliverPdf(await buildInvoicePdf(invoice, settings, profile))
    })
  const remove = () =>
    run('delete', async () => {
      await deleteInvoice(invoice.id)
      onDeleted(invoice.id)
    })

  const overdueDays = invoice.status === 'SENT' ? Math.max(0, daysBetween(invoice.dueOn, today)) : 0
  const stage = nextChase(overdueDays, invoice.remindersSent)
  const waitDays = invoice.status === 'SENT' && stage === null && invoice.remindersSent < CHASE_AFTER_DAYS.length ? CHASE_AFTER_DAYS[invoice.remindersSent] - overdueDays : 0

  return (
    <article className="surface flex flex-col gap-4 p-5" aria-label={`Invoice ${invoice.number}`}>
      <button type="button" onClick={onBack} className="btn btn-ghost self-start">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All invoices
      </button>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold">
            {invoice.number} · {invoice.customerName}
          </h2>
          <p className="muted text-sm">
            Made {prettyDate(invoice.issuedOn)}, due {prettyDate(invoice.dueOn)}
            {overdueDays > 0 ? ` (${overdueDays} day${overdueDays === 1 ? '' : 's'} late)` : ''}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${look.colour}`}>{look.word}</span>
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Items on {invoice.number}</caption>
        <tbody>
          {invoice.items.map((item, index) => (
            <tr key={index} className="border-b border-(--line)">
              <td className="py-2 pr-2">
                {item.description}
                {item.quantity !== 1 && <span className="muted"> × {item.quantity}</span>}
              </td>
              <td className="py-2 text-right whitespace-nowrap">{formatRand(lineCents(item))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {invoice.vatCents > 0 && (
            <>
              <tr>
                <td className="pt-2">Subtotal</td>
                <td className="pt-2 text-right">{formatRand(invoice.subtotalCents)}</td>
              </tr>
              <tr>
                <td>VAT {invoice.vatRate}%</td>
                <td className="text-right">{formatRand(invoice.vatCents)}</td>
              </tr>
            </>
          )}
          <tr className="text-base font-extrabold">
            <td className="pt-2">Total</td>
            <td className="pt-2 text-right">{formatRand(invoice.totalCents)}</td>
          </tr>
        </tfoot>
      </table>
      {invoice.note && <p className="muted text-sm">{invoice.note}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void pdf()} disabled={busy !== null || !profile} className="btn btn-ghost">
          {busy === 'pdf' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileDown className="size-4" aria-hidden="true" />}
          PDF
        </button>
        {invoice.customerPhone && (
          <a href={whatsAppLink(invoice.customerPhone, message)} target="_blank" rel="noopener noreferrer" className="btn btn-channel">
            <MessageCircle className="size-4" aria-hidden="true" />
            WhatsApp it
          </a>
        )}
        {invoice.customerEmail && (
          <a href={mailtoLink(invoice.customerEmail, `Invoice ${invoice.number}`, message)} className="btn btn-channel">
            <Mail className="size-4" aria-hidden="true" />
            Email it
          </a>
        )}
      </div>
      {invoice.status === 'DRAFT' && <p className="muted text-xs">Send the PDF and message to your customer, then tap “I sent it” so Volita can remind you when payment is late.</p>}

      <div className="flex flex-wrap gap-2">
        {invoice.status === 'DRAFT' && (
          <button type="button" onClick={() => void move('SENT')} disabled={busy !== null} className="btn btn-primary">
            I sent it
          </button>
        )}
        {invoice.status === 'SENT' && (
          <button type="button" onClick={() => void move('PAID')} disabled={busy !== null} className="btn btn-primary">
            Mark as paid
          </button>
        )}
        {(invoice.status === 'DRAFT' || invoice.status === 'SENT') && (
          <button type="button" onClick={() => void move('CANCELLED')} disabled={busy !== null} className="btn btn-ghost">
            Cancel invoice
          </button>
        )}
        {invoice.status === 'DRAFT' && (
          <button type="button" onClick={() => void remove()} disabled={busy !== null} className="btn btn-ghost">
            Delete draft
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {profile && invoice.status !== 'CANCELLED' && <JobSheet customer={invoice.customerName} profile={profile} />}

      {profile && stage !== null && (
        <MessagePanel
          key={`chase-${invoice.remindersSent}`}
          heading={`Payment reminder ${stage} of ${CHASE_AFTER_DAYS.length}`}
          why={`This invoice is ${overdueDays} days late. Read it, change anything, then send it from your own WhatsApp or email.`}
          message={chaserMessage(stage, invoice, profile, today)}
          phone={invoice.customerPhone}
          email={invoice.customerEmail}
          confirmLabel="I sent this reminder"
          onConfirm={async () => onChange(await patchInvoice(invoice.id, { reminded: true }))}
        />
      )}
      {invoice.status === 'SENT' && stage === null && invoice.remindersSent >= CHASE_AFTER_DAYS.length && (
        <p className="muted text-sm">All three reminders have been sent. It is time to phone {invoice.customerName}.</p>
      )}
      {waitDays > 0 && overdueDays > 0 && <p className="muted text-sm">Next payment reminder in {waitDays} day{waitDays === 1 ? '' : 's'}.</p>}

      {profile && invoice.status === 'PAID' && settings.reviewLink && (
        <MessagePanel
          heading="Ask for a review"
          why="The job is paid. A happy customer is the best time to ask."
          message={reviewMessage(invoice.customerName, settings.reviewLink, profile)}
          phone={invoice.customerPhone}
          email={invoice.customerEmail}
        />
      )}
      {invoice.status === 'PAID' && !settings.reviewLink && <p className="muted text-sm">Add your Google review link under My details and Volita will write a review request for each paid job.</p>}
    </article>
  )
}
