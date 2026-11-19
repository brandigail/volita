import { neon } from '@neondatabase/serverless'
import { addDaysTo, calcTotals, daysBetween, invoiceNumber } from '../../../src/lib/money.ts'
import {
  BUSINESS_LIMITS,
  DEFAULT_BUSINESS_SETTINGS,
  invoiceItemSchema,
  type BusinessSettings,
  type Invoice,
  type InvoiceInput,
  type InvoiceItem,
  type InvoicePatch,
  type InvoiceStatus,
} from '../../../src/types/business.ts'
import { z } from 'zod'
import { encryptText, openText } from './crypto.ts'

const sql = () => neon(process.env.DATABASE_URL ?? '')

interface SettingsRow {
  vat_registered: boolean
  vat_number: string
  bank_details: string
  payment_terms_days: number
  invoice_note: string
  review_link: string
}

interface InvoiceRow {
  id: string
  number: string
  contact_id: string | null
  customer_name: string
  customer_phone: string
  customer_email: string
  items: string
  vat_rate: number
  subtotal_cents: string | number
  vat_cents: string | number
  total_cents: string | number
  status: InvoiceStatus
  issued_on: string
  due_on: string
  paid_at: string | Date | null
  reminders_sent: number
  last_reminded_at: string | Date | null
  note: string
  created_at: string | Date
}

const INVOICE_COLUMNS = `id, number, contact_id, customer_name, customer_phone, customer_email, items, vat_rate, subtotal_cents, vat_cents, total_cents,
  status, issued_on::text AS issued_on, due_on::text AS due_on, paid_at, reminders_sent, last_reminded_at, note, created_at`

const iso = (value: string | Date) => new Date(value).toISOString()
const itemsSchema = z.array(invoiceItemSchema)

/** The business details; a person who never saved any gets the defaults. Text is encrypted at rest. */
export async function getSettings(userId: string): Promise<BusinessSettings> {
  const [row] = (await sql().query(
    'SELECT vat_registered, vat_number, bank_details, payment_terms_days, invoice_note, review_link FROM business_settings WHERE user_id = $1',
    [userId],
  )) as SettingsRow[]
  if (!row) return DEFAULT_BUSINESS_SETTINGS
  return {
    vatRegistered: row.vat_registered,
    vatNumber: openText(userId, 'business_settings.vat_number', row.vat_number),
    bankDetails: openText(userId, 'business_settings.bank_details', row.bank_details),
    paymentTermsDays: row.payment_terms_days,
    invoiceNote: openText(userId, 'business_settings.invoice_note', row.invoice_note),
    reviewLink: row.review_link,
  }
}

export async function saveSettings(userId: string, settings: BusinessSettings): Promise<void> {
  await sql().query(
    `INSERT INTO business_settings (user_id, vat_registered, vat_number, bank_details, payment_terms_days, invoice_note, review_link)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET vat_registered = $2, vat_number = $3, bank_details = $4, payment_terms_days = $5,
       invoice_note = $6, review_link = $7, updated_at = now()`,
    [
      userId,
      settings.vatRegistered,
      encryptText(userId, 'business_settings.vat_number', settings.vatNumber),
      encryptText(userId, 'business_settings.bank_details', settings.bankDetails),
      settings.paymentTermsDays,
      encryptText(userId, 'business_settings.invoice_note', settings.invoiceNote),
      settings.reviewLink,
    ],
  )
}

function toInvoice(userId: string, row: InvoiceRow): Invoice {
  const parsed = itemsSchema.safeParse(JSON.parse(openText(userId, 'invoices.items', row.items)))
  return {
    id: row.id,
    number: row.number,
    contactId: row.contact_id,
    customerName: openText(userId, 'invoices.customer_name', row.customer_name),
    customerPhone: openText(userId, 'invoices.customer_phone', row.customer_phone),
    customerEmail: openText(userId, 'invoices.customer_email', row.customer_email),
    items: parsed.success ? parsed.data : [],
    vatRate: row.vat_rate,
    subtotalCents: Number(row.subtotal_cents),
    vatCents: Number(row.vat_cents),
    totalCents: Number(row.total_cents),
    status: row.status,
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    paidAt: row.paid_at ? iso(row.paid_at) : null,
    remindersSent: row.reminders_sent,
    lastRemindedAt: row.last_reminded_at ? iso(row.last_reminded_at) : null,
    note: openText(userId, 'invoices.note', row.note),
    createdAt: iso(row.created_at),
  }
}

const sealItems = (userId: string, items: InvoiceItem[]) => encryptText(userId, 'invoices.items', JSON.stringify(items))

/** Newest first. `status` narrows the list; invoices are never more than {@link BUSINESS_LIMITS.invoicesPerUser}. */
export async function listInvoices(userId: string, status?: InvoiceStatus): Promise<Invoice[]> {
  const rows = (await sql().query(
    `SELECT ${INVOICE_COLUMNS} FROM invoices WHERE user_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY created_at DESC LIMIT ${BUSINESS_LIMITS.invoicesPerUser}`,
    [userId, status ?? null],
  )) as InvoiceRow[]
  return rows.map((row) => toInvoice(userId, row))
}

export async function getInvoice(userId: string, id: string): Promise<Invoice | null> {
  const [row] = (await sql().query(`SELECT ${INVOICE_COLUMNS} FROM invoices WHERE id = $1 AND user_id = $2`, [id, userId])) as InvoiceRow[]
  return row ? toInvoice(userId, row) : null
}

/** Finds an invoice by the number printed on it ("INV-0007", or just "7"). */
export async function findInvoiceByNumber(userId: string, text: string): Promise<Invoice | null> {
  const digits = /\d+/.exec(text)?.[0]
  if (!digits) return null
  const [row] = (await sql().query(`SELECT ${INVOICE_COLUMNS} FROM invoices WHERE user_id = $1 AND number = $2`, [userId, invoiceNumber(Number(digits))])) as InvoiceRow[]
  return row ? toInvoice(userId, row) : null
}

export type CreateResult = { ok: true; invoice: Invoice } | { ok: false; message: string }

/** Numbers each person's invoices 1, 2, 3 without gaps or repeats, even when two are made at once. */
async function nextSequence(userId: string): Promise<number> {
  const [row] = (await sql().query(
    `INSERT INTO business_settings (user_id, next_invoice_number) VALUES ($1, 2)
     ON CONFLICT (user_id) DO UPDATE SET next_invoice_number = business_settings.next_invoice_number + 1
     RETURNING next_invoice_number - 1 AS sequence`,
    [userId],
  )) as { sequence: number }[]
  return row.sequence
}

export async function createInvoice(userId: string, input: InvoiceInput, settings: BusinessSettings, today: string): Promise<CreateResult> {
  const [{ total }] = (await sql().query('SELECT count(*)::int AS total FROM invoices WHERE user_id = $1', [userId])) as { total: number }[]
  if (total >= BUSINESS_LIMITS.invoicesPerUser) return { ok: false, message: `You already have ${BUSINESS_LIMITS.invoicesPerUser} invoices. Delete some drafts first.` }

  const totals = calcTotals(input.items, input.vatRate)
  if (totals.totalCents > BUSINESS_LIMITS.maxCents) return { ok: false, message: 'That total is too large for one invoice.' }
  const issuedOn = input.issuedOn ?? today
  const dueOn = input.dueOn ?? addDaysTo(issuedOn, settings.paymentTermsDays)
  const number = invoiceNumber(await nextSequence(userId))

  const [row] = (await sql().query(
    `INSERT INTO invoices (user_id, number, contact_id, customer_name, customer_phone, customer_email, items, vat_rate, subtotal_cents, vat_cents, total_cents, issued_on, due_on, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING ${INVOICE_COLUMNS}`,
    [
      userId,
      number,
      input.contactId,
      encryptText(userId, 'invoices.customer_name', input.customerName),
      encryptText(userId, 'invoices.customer_phone', input.customerPhone),
      encryptText(userId, 'invoices.customer_email', input.customerEmail),
      sealItems(userId, input.items),
      input.vatRate,
      totals.subtotalCents,
      totals.vatCents,
      totals.totalCents,
      issuedOn,
      dueOn,
      encryptText(userId, 'invoices.note', input.note),
    ],
  )) as InvoiceRow[]
  return { ok: true, invoice: toInvoice(userId, row) }
}

export type PatchResult = { ok: true; invoice: Invoice } | { ok: false; status: 404 | 409; message: string }

/**
 * Changes an invoice. The text (items, customer, VAT) can only change while it is a draft, so a sent invoice always says what the
 * customer was told. Status moves forward (draft, sent, paid) or the invoice is cancelled; a paid one is never reopened.
 */
export async function patchInvoice(userId: string, id: string, patch: InvoicePatch): Promise<PatchResult> {
  const current = await getInvoice(userId, id)
  if (!current) return { ok: false, status: 404, message: 'That invoice was not found.' }
  const editsText = patch.items !== undefined || patch.customerName !== undefined || patch.customerPhone !== undefined || patch.customerEmail !== undefined || patch.vatRate !== undefined || patch.note !== undefined
  if (editsText && current.status !== 'DRAFT') return { ok: false, status: 409, message: 'A sent invoice cannot be changed. Cancel it and make a new one.' }
  if (current.status === 'PAID' && patch.status !== undefined && patch.status !== 'PAID') return { ok: false, status: 409, message: 'A paid invoice cannot be reopened.' }
  if (current.status === 'CANCELLED' && patch.status !== undefined && patch.status !== 'CANCELLED') return { ok: false, status: 409, message: 'A cancelled invoice cannot be reopened.' }

  const items = patch.items ?? current.items
  const vatRate = patch.vatRate ?? current.vatRate
  const totals = calcTotals(items, vatRate)
  if (totals.totalCents > BUSINESS_LIMITS.maxCents) return { ok: false, status: 409, message: 'That total is too large for one invoice.' }
  const status = patch.status ?? current.status

  const [row] = (await sql().query(
    `UPDATE invoices SET
       customer_name = $3, customer_phone = $4, customer_email = $5, items = $6, vat_rate = $7,
       subtotal_cents = $8, vat_cents = $9, total_cents = $10, status = $11, due_on = $12, note = $13,
       paid_at = CASE WHEN $11 = 'PAID' AND paid_at IS NULL THEN now() ELSE paid_at END,
       reminders_sent = reminders_sent + $14, last_reminded_at = CASE WHEN $14 = 1 THEN now() ELSE last_reminded_at END,
       updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING ${INVOICE_COLUMNS}`,
    [
      id,
      userId,
      encryptText(userId, 'invoices.customer_name', patch.customerName ?? current.customerName),
      encryptText(userId, 'invoices.customer_phone', patch.customerPhone ?? current.customerPhone),
      encryptText(userId, 'invoices.customer_email', patch.customerEmail ?? current.customerEmail),
      sealItems(userId, items),
      vatRate,
      totals.subtotalCents,
      totals.vatCents,
      totals.totalCents,
      status,
      patch.dueOn ?? current.dueOn,
      encryptText(userId, 'invoices.note', patch.note ?? current.note),
      patch.reminded ? 1 : 0,
    ],
  )) as InvoiceRow[]
  return { ok: true, invoice: toInvoice(userId, row) }
}

/** Only a draft can be deleted; anything that was sent stays on the books (cancel it instead). */
export async function deleteDraftInvoice(userId: string, id: string): Promise<'deleted' | 'missing' | 'sent'> {
  const rows = await sql().query("DELETE FROM invoices WHERE id = $1 AND user_id = $2 AND status = 'DRAFT' RETURNING id", [id, userId])
  if (rows.length > 0) return 'deleted'
  return (await getInvoice(userId, id)) ? 'sent' : 'missing'
}

export interface MoneyOwed {
  /** Everything sent and not yet paid. */
  owedCents: number
  /** The part of that which is past its due date. */
  overdueCents: number
  overdue: { invoice: Invoice; daysOverdue: number }[]
}

/** What is outstanding today (`today` is the person's own date, YYYY-MM-DD), the most overdue first. */
export async function moneyOwed(userId: string, today: string): Promise<MoneyOwed> {
  const open = (await listInvoices(userId, 'SENT')).sort((a, b) => a.dueOn.localeCompare(b.dueOn))
  const overdue = open.filter((invoice) => invoice.dueOn < today).map((invoice) => ({ invoice, daysOverdue: daysBetween(invoice.dueOn, today) }))
  return {
    owedCents: open.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    overdueCents: overdue.reduce((sum, { invoice }) => sum + invoice.totalCents, 0),
    overdue,
  }
}
