import { z } from 'zod'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** A model that cannot read a field sometimes gives null instead of an empty string. */
const text = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max))

/** What is printed on a business card. */
export const cardReadingSchema = z.object({
  name: text(100),
  company: text(100),
  role: text(80),
  phone: text(40),
  email: text(200),
})
export type CardReading = z.infer<typeof cardReadingSchema>

/** A rand amount as the model reads it ("245.50"), or null when it is not on the receipt. */
const rand = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined) return null
    const number = typeof value === 'number' ? value : Number(value.replace(/[^\d.,-]/g, '').replace(',', '.'))
    return Number.isFinite(number) && number >= 0 && number < 100_000_000 ? Math.round(number * 100) : null
  })

/** What is printed on a till slip or invoice. The model writes `total` and `vat` in rand; they come out as cents. */
export const receiptReadingSchema = z
  .object({
    supplier: text(100),
    /** YYYY-MM-DD, or empty when the date could not be read. */
    date: text(10).transform((value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '')),
    total: rand,
    vat: rand,
  })
  .transform(({ supplier, date, total, vat }) => ({ supplier, date, totalCents: total, vatCents: vat }))
export type ReceiptReading = z.infer<typeof receiptReadingSchema>

export const EXPENSE_LIMITS = { supplier: 100, note: 200, perUser: 2000, maxCents: 100_000_000_00 } as const

export const expenseInputSchema = z.object({
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplier: z.string().trim().min(1).max(EXPENSE_LIMITS.supplier),
  note: z.string().trim().max(EXPENSE_LIMITS.note).default(''),
  totalCents: z.number().int().min(1).max(EXPENSE_LIMITS.maxCents),
  vatCents: z.number().int().min(0).max(EXPENSE_LIMITS.maxCents).default(0),
})
export type ExpenseInput = z.infer<typeof expenseInputSchema>

export interface Expense extends ExpenseInput {
  id: string
  createdAt: string
}

/** A photo sent to be read: a data URL the app has already shrunk. */
export const MAX_SCAN_IMAGE_CHARS = 1_400_000
export const scanImageSchema = z.object({
  image: z
    .string()
    .max(MAX_SCAN_IMAGE_CHARS)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
})
