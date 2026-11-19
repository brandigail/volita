import { z } from 'zod'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** One line on an invoice. Prices are whole cents (rand and cents), never floating point rand. */
export interface InvoiceItem {
  description: string
  quantity: number
  unitCents: number
}

export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'CANCELLED'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const BUSINESS_LIMITS = {
  items: 30,
  description: 200,
  customerName: 100,
  customerPhone: 40,
  customerEmail: 120,
  note: 500,
  bank: 400,
  vatNumber: 30,
  link: 300,
  invoicesPerUser: 1000,
  maxCents: 100_000_000_00,
} as const

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(BUSINESS_LIMITS.description),
  quantity: z.number().positive().max(100_000),
  unitCents: z.number().int().min(0).max(BUSINESS_LIMITS.maxCents),
})

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const invoiceInputSchema = z.object({
  customerName: z.string().trim().min(1).max(BUSINESS_LIMITS.customerName),
  customerPhone: z.string().trim().max(BUSINESS_LIMITS.customerPhone).default(''),
  customerEmail: z.string().trim().max(BUSINESS_LIMITS.customerEmail).default(''),
  contactId: z.uuid().nullable().default(null),
  items: z.array(invoiceItemSchema).min(1).max(BUSINESS_LIMITS.items),
  /** Percent added on top of the item prices: 0 when the business is not VAT registered, 15 in South Africa. */
  vatRate: z.number().int().min(0).max(30).default(0),
  issuedOn: dateOnly.optional(),
  dueOn: dateOnly.optional(),
  note: z.string().trim().max(BUSINESS_LIMITS.note).default(''),
})
export type InvoiceInput = z.infer<typeof invoiceInputSchema>

/** What can change after an invoice exists: its status, or its text while it is still a draft. */
export const invoicePatchSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  // Written out rather than reused from the create schema: those fields carry defaults, which would make "not given" look like "blank it".
  customerName: z.string().trim().min(1).max(BUSINESS_LIMITS.customerName).optional(),
  customerPhone: z.string().trim().max(BUSINESS_LIMITS.customerPhone).optional(),
  customerEmail: z.string().trim().max(BUSINESS_LIMITS.customerEmail).optional(),
  items: z.array(invoiceItemSchema).min(1).max(BUSINESS_LIMITS.items).optional(),
  vatRate: z.number().int().min(0).max(30).optional(),
  dueOn: dateOnly.optional(),
  note: z.string().trim().max(BUSINESS_LIMITS.note).optional(),
  /** Set when a payment reminder for this invoice was sent, so the next one is not suggested too soon. */
  reminded: z.boolean().optional(),
})
export type InvoicePatch = z.infer<typeof invoicePatchSchema>

export interface Invoice {
  id: string
  number: string
  contactId: string | null
  customerName: string
  customerPhone: string
  customerEmail: string
  items: InvoiceItem[]
  vatRate: number
  subtotalCents: number
  vatCents: number
  totalCents: number
  status: InvoiceStatus
  /** YYYY-MM-DD. */
  issuedOn: string
  dueOn: string
  paidAt: string | null
  remindersSent: number
  lastRemindedAt: string | null
  note: string
  createdAt: string
}

export interface BusinessSettings {
  vatRegistered: boolean
  vatNumber: string
  /** Shown on every invoice so customers can pay by EFT. Never sent to the AI. */
  bankDetails: string
  paymentTermsDays: number
  invoiceNote: string
  /** The owner's Google review link, used when asking a happy customer for a review. */
  reviewLink: string
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  vatRegistered: false,
  vatNumber: '',
  bankDetails: '',
  paymentTermsDays: 7,
  invoiceNote: '',
  reviewLink: '',
}

export const businessSettingsSchema = z.object({
  vatRegistered: z.boolean(),
  vatNumber: z.string().trim().max(BUSINESS_LIMITS.vatNumber),
  bankDetails: z.string().trim().max(BUSINESS_LIMITS.bank),
  paymentTermsDays: z.number().int().min(0).max(90),
  invoiceNote: z.string().trim().max(BUSINESS_LIMITS.note),
  reviewLink: z
    .string()
    .trim()
    .max(BUSINESS_LIMITS.link)
    .refine((value) => value === '' || /^https:\/\/\S+$/i.test(value), 'The review link must start with https://'),
})

export interface InvoicesResponse {
  invoices: Invoice[]
}

/** One thing that happened with a customer, for their timeline. */
export type TimelineKind = 'draft' | 'invoice' | 'agenda' | 'promise' | 'booking'

export interface TimelineEntry {
  kind: TimelineKind
  id: string
  /** ISO time the thing happened or is planned. */
  at: string
  title: string
  detail: string
  /** True when it is done (sent, paid, finished). */
  done: boolean
}

export interface CustomerSummary {
  id: string
  name: string
  phone: string
  email: string
  /** Money this customer still owes, in cents. */
  owedCents: number
  /** ISO time of the latest thing with them, or null. */
  lastAt: string | null
}

export interface CustomerStory {
  customer: CustomerSummary
  notes: string
  timeline: TimelineEntry[]
}
