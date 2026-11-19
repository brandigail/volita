import { neon } from '@neondatabase/serverless'
import { formatRand } from '../../../src/lib/money.ts'
import { mentionsCustomer } from '../../../src/lib/customer-match.ts'
import type { Invoice, CustomerSummary, TimelineEntry } from '../../../src/types/business.ts'
import type { Contact } from '../../../src/types/memory.ts'
import { openText } from './crypto.ts'

const sql = () => neon(process.env.DATABASE_URL ?? '')

/** Drafts are encrypted, so the database cannot search them: the newest are opened and looked through here. */
const DRAFT_WINDOW = 300
const AGENDA_WINDOW = 300
const PREVIEW_CHARS = 120
const KIND_WORD: Record<string, string> = { EMAIL: 'Email', QUOTE: 'Quote', WHATSAPP: 'WhatsApp', SMS: 'Text', NOTE: 'Note' }

interface DraftRow {
  id: string
  category: string
  recipient: string
  subject: string
  body: string
  created_at: string | Date
  sent_at: string | Date | null
}

interface AgendaRow {
  id: string
  title: string
  starts_at: string | Date
  notes: string
}

/** The person's newest drafts and agenda items, opened, ready to be matched against customers. */
export interface ActivitySource {
  drafts: { id: string; category: string; recipient: string; subject: string; body: string; at: string; sent: boolean }[]
  agenda: { id: string; title: string; notes: string; at: string; past: boolean }[]
}

/** Opens the person's newest drafts and agenda items once, so a whole list of customers can be matched without asking the database for each. */
export async function loadActivitySource(userId: string, now: Date): Promise<ActivitySource> {
  const [drafts, agenda] = await Promise.all([
    sql().query(
      `SELECT id, category, recipient, subject, body, created_at, sent_at FROM drafts WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${DRAFT_WINDOW}`,
      [userId],
    ) as unknown as Promise<DraftRow[]>,
    sql().query(
      `SELECT id, title, starts_at, notes FROM agenda_items WHERE user_id = $1 AND starts_at > $2::timestamptz - interval '180 days' ORDER BY starts_at DESC LIMIT ${AGENDA_WINDOW}`,
      [userId, now.toISOString()],
    ) as unknown as Promise<AgendaRow[]>,
  ])
  return {
    drafts: drafts.map((row) => ({
      id: row.id,
      category: row.category,
      recipient: openText(userId, 'drafts.recipient', row.recipient),
      subject: openText(userId, 'drafts.subject', row.subject),
      body: openText(userId, 'drafts.body', row.body),
      at: new Date(row.sent_at ?? row.created_at).toISOString(),
      sent: row.sent_at !== null,
    })),
    agenda: agenda.map((row) => ({
      id: row.id,
      title: openText(userId, 'agenda_items.title', row.title),
      notes: openText(userId, 'agenda_items.notes', row.notes),
      at: new Date(row.starts_at).toISOString(),
      past: new Date(row.starts_at) < now,
    })),
  }
}

const preview = (text: string) => (text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text)

/** Whether an invoice belongs to this customer: saved against their contact card, or made out to their name or number. */
export const invoiceIsFor = (invoice: Invoice, contact: Contact): boolean =>
  invoice.contactId === contact.id || mentionsCustomer(`${invoice.customerName} ${invoice.customerPhone} ${invoice.customerEmail}`, contact)

const invoiceEntry = (invoice: Invoice): TimelineEntry => ({
  kind: 'invoice',
  id: invoice.id,
  at: invoice.paidAt ?? invoice.createdAt,
  title: `${invoice.number}, ${formatRand(invoice.totalCents)}`,
  detail: invoice.status === 'PAID' ? 'Paid' : invoice.status === 'SENT' ? `Sent, due ${invoice.dueOn}` : invoice.status === 'CANCELLED' ? 'Cancelled' : 'Draft, not sent yet',
  done: invoice.status === 'PAID' || invoice.status === 'CANCELLED',
})

/** The customer's story: every message written to them, meeting with them and invoice for them, newest first. */
export function timelineFor(contact: Contact, invoices: Invoice[], source: ActivitySource): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const draft of source.drafts) {
    if (!mentionsCustomer(`${draft.recipient} ${draft.subject}`, contact)) continue
    const kind = KIND_WORD[draft.category] ?? 'Post'
    entries.push({
      kind: 'draft',
      id: draft.id,
      at: draft.at,
      title: draft.subject ? `${kind}: ${draft.subject}` : `${kind} to ${draft.recipient || contact.name}`,
      detail: draft.sent ? preview(draft.body) : `Not sent yet. ${preview(draft.body)}`,
      done: draft.sent,
    })
  }
  for (const item of source.agenda) {
    if (!mentionsCustomer(`${item.title} ${item.notes}`, contact)) continue
    entries.push({ kind: 'agenda', id: item.id, at: item.at, title: item.title, detail: item.past ? 'Done' : 'Coming up', done: item.past })
  }
  for (const invoice of invoices) if (invoiceIsFor(invoice, contact)) entries.push(invoiceEntry(invoice))
  return entries.sort((a, b) => b.at.localeCompare(a.at))
}

/** A line in the customer list: what they owe and when you last dealt with them. */
export function summarise(contact: Contact, invoices: Invoice[], timeline: TimelineEntry[]): CustomerSummary {
  const owedCents = invoices.filter((invoice) => invoice.status === 'SENT' && invoiceIsFor(invoice, contact)).reduce((sum, invoice) => sum + invoice.totalCents, 0)
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    owedCents,
    lastAt: timeline.find((entry) => new Date(entry.at) <= new Date())?.at ?? timeline[0]?.at ?? null,
  }
}
