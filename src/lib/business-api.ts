import { z } from 'zod'
import {
  INVOICE_STATUSES,
  type BusinessSettings,
  type CustomerStory,
  type CustomerSummary,
  type Invoice,
  type InvoiceInput,
  type InvoicePatch,
} from '../types/business'
import { ApiRequestError, request } from './api'

const itemSchema = z.object({ description: z.string(), quantity: z.number(), unitCents: z.number() })

const invoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  contactId: z.string().nullable(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerEmail: z.string(),
  items: z.array(itemSchema),
  vatRate: z.number(),
  subtotalCents: z.number(),
  vatCents: z.number(),
  totalCents: z.number(),
  status: z.enum(INVOICE_STATUSES),
  issuedOn: z.string(),
  dueOn: z.string(),
  paidAt: z.string().nullable(),
  remindersSent: z.number(),
  lastRemindedAt: z.string().nullable(),
  note: z.string(),
  createdAt: z.string(),
})

const settingsSchema = z.object({
  vatRegistered: z.boolean(),
  vatNumber: z.string(),
  bankDetails: z.string(),
  paymentTermsDays: z.number(),
  invoiceNote: z.string(),
  reviewLink: z.string(),
})

const summarySchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string(),
  owedCents: z.number(),
  lastAt: z.string().nullable(),
})

const storySchema = z.object({
  customer: summarySchema,
  notes: z.string(),
  timeline: z.array(
    z.object({
      kind: z.enum(['draft', 'invoice', 'agenda', 'promise', 'booking']),
      id: z.string(),
      at: z.string(),
      title: z.string(),
      detail: z.string(),
      done: z.boolean(),
    }),
  ),
})

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
  return result.data
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function fetchInvoices(): Promise<Invoice[]> {
  return parse(z.object({ invoices: z.array(invoiceSchema) }), await request('/api/invoices', { method: 'GET' })).invoices
}

export async function createInvoice(input: Omit<InvoiceInput, 'contactId'> & { contactId?: string | null }): Promise<Invoice> {
  return parse(invoiceSchema, await request('/api/invoices', jsonInit('POST', input)))
}

export async function patchInvoice(id: string, patch: InvoicePatch): Promise<Invoice> {
  return parse(invoiceSchema, await request(`/api/invoices/${id}`, jsonInit('PATCH', patch)))
}

export async function deleteInvoice(id: string): Promise<void> {
  await request(`/api/invoices/${id}`, { method: 'DELETE' })
}

export async function fetchBusinessSettings(): Promise<BusinessSettings> {
  return parse(settingsSchema, await request('/api/business', { method: 'GET' }))
}

export async function saveBusinessSettings(settings: BusinessSettings): Promise<BusinessSettings> {
  return parse(settingsSchema, await request('/api/business', jsonInit('PUT', settings)))
}

export async function fetchCustomers(): Promise<CustomerSummary[]> {
  return parse(z.object({ customers: z.array(summarySchema) }), await request('/api/customers', { method: 'GET' })).customers
}

export async function fetchCustomerStory(id: string): Promise<CustomerStory> {
  return parse(storySchema, await request(`/api/customers/${id}`, { method: 'GET' }))
}
