import { z } from 'zod'
import type { CardReading, Expense, ExpenseInput, ReceiptReading } from '../types/scan'
import { ApiRequestError, request } from './api'
import { shrinkImage } from './image'

/** A card is read from a close photo; text on a till slip is small, so receipts keep more detail. */
const CARD_SIDE = 1400
const RECEIPT_SIDE = 1600
const QUALITY = 0.8

const cardSchema = z.object({ card: z.object({ name: z.string(), company: z.string(), role: z.string(), phone: z.string(), email: z.string() }) })
const receiptSchema = z.object({ receipt: z.object({ supplier: z.string(), date: z.string(), totalCents: z.number().nullable(), vatCents: z.number().nullable() }) })
const expenseSchema = z.object({ id: z.string(), spentOn: z.string(), supplier: z.string(), note: z.string(), totalCents: z.number(), vatCents: z.number(), createdAt: z.string() })

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
  return result.data
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Reads a photo of a business card. The photo is shrunk on the phone and is not kept anywhere. */
export async function scanCard(file: File): Promise<CardReading> {
  return parse(cardSchema, await request('/api/scan-card', jsonInit('POST', { image: await shrinkImage(file, CARD_SIDE, QUALITY) }))).card
}

/** Reads a photo of a receipt. The photo is shrunk on the phone and is not kept anywhere. */
export async function scanReceipt(file: File): Promise<ReceiptReading> {
  return parse(receiptSchema, await request('/api/scan-receipt', jsonInit('POST', { image: await shrinkImage(file, RECEIPT_SIDE, QUALITY) }))).receipt
}

export async function fetchExpenses(): Promise<Expense[]> {
  return parse(z.object({ expenses: z.array(expenseSchema) }), await request('/api/expenses', { method: 'GET' })).expenses
}

export async function saveExpense(input: ExpenseInput): Promise<Expense> {
  return parse(expenseSchema, await request('/api/expenses', jsonInit('POST', input)))
}

export async function deleteExpense(id: string): Promise<void> {
  await request(`/api/expenses/${id}`, { method: 'DELETE' })
}
