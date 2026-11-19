import type { InvoiceItem } from '../types/business.ts'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export interface Totals {
  subtotalCents: number
  vatCents: number
  totalCents: number
}

/** The cost of one line, rounded to the cent. */
export const lineCents = (item: InvoiceItem): number => Math.round(item.quantity * item.unitCents)

/** Item prices do not include VAT; the percentage is added on top of the sum, rounded once at the end. */
export function calcTotals(items: readonly InvoiceItem[], vatRate: number): Totals {
  const subtotalCents = items.reduce((sum, item) => sum + lineCents(item), 0)
  const vatCents = Math.round((subtotalCents * vatRate) / 100)
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents }
}

/** "R6 957.50" with a space for thousands, the way South African quotes are written. */
export function formatRand(cents: number): string {
  const negative = cents < 0
  const whole = Math.floor(Math.abs(cents) / 100)
  const rest = String(Math.abs(cents) % 100).padStart(2, '0')
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '-' : ''}R${grouped}.${rest}`
}

/** Turns what someone typed ("1 250,50", "R450", "450.5") into cents, or null when it is not an amount. */
export function parseRand(text: string): number | null {
  const cleaned = text.replace(/[Rr\s]/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}

/** The invoice number as printed: INV-0007. */
export const invoiceNumber = (sequence: number): string => `INV-${String(sequence).padStart(4, '0')}`

const MS_PER_DAY = 86_400_000

/** Whole days between two YYYY-MM-DD dates (positive when `later` is after `earlier`). */
export function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / MS_PER_DAY)
}

/** Adds days to a YYYY-MM-DD date. */
export function addDaysTo(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** The three polite-then-firmer reminders: after 7, 14 and 30 days overdue. */
export const CHASE_AFTER_DAYS = [7, 14, 30] as const
export type ChaseStage = 1 | 2 | 3

/**
 * Which payment reminder to write next, or null when none is due. Each reminder is only suggested once its day has passed
 * and the earlier ones were sent, so someone who is 40 days late still gets the friendly one first if none was sent.
 */
export function nextChase(daysOverdue: number, remindersSent: number): ChaseStage | null {
  if (remindersSent >= CHASE_AFTER_DAYS.length) return null
  const stage = (remindersSent + 1) as ChaseStage
  return daysOverdue >= CHASE_AFTER_DAYS[stage - 1] ? stage : null
}
