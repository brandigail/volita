import type { Invoice, InvoiceStatus } from '../../types/business'

/** How each state of an invoice is worded and coloured. Overdue is not stored: a sent invoice is overdue once its due date has passed. */
export const STATUS_LOOK: Record<InvoiceStatus | 'OVERDUE', { word: string; colour: string }> = {
  DRAFT: { word: 'Draft', colour: 'bg-black/10 dark:bg-white/10' },
  SENT: { word: 'Sent', colour: 'bg-sky-500/15 text-sky-800 dark:text-sky-300' },
  OVERDUE: { word: 'Overdue', colour: 'bg-red-500/15 text-red-800 dark:text-red-300' },
  PAID: { word: 'Paid', colour: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' },
  CANCELLED: { word: 'Cancelled', colour: 'bg-black/10 line-through dark:bg-white/10' },
}

export const lookOf = (invoice: Invoice, today: string): InvoiceStatus | 'OVERDUE' => (invoice.status === 'SENT' && invoice.dueOn < today ? 'OVERDUE' : invoice.status)
