import type { Invoice } from '../types/business'
import { plain } from './customer-match'

/** What was charged for an item the last time it was invoiced. */
export interface PastPrice {
  unitCents: number
  /** The invoice it was on, for "last time, on INV-0007". */
  number: string
}

/** The latest price for every item the owner has invoiced before, by what it was called. Cancelled invoices do not count. */
export function lastPrices(invoices: readonly Invoice[]): Map<string, PastPrice> {
  const latest = new Map<string, PastPrice>()
  const newestFirst = [...invoices].filter((invoice) => invoice.status !== 'CANCELLED').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const invoice of newestFirst) {
    for (const item of invoice.items) {
      const key = plain(item.description)
      if (key !== '' && !latest.has(key)) latest.set(key, { unitCents: item.unitCents, number: invoice.number })
    }
  }
  return latest
}

export interface PriceNote extends PastPrice {
  /** Whole percent the new price is above (positive) or below (negative) the last one. */
  changePercent: number
}

/** A note when the price typed differs from last time, or null when it is new, the same, or not a price yet. */
export function priceNote(past: ReadonlyMap<string, PastPrice>, description: string, unitCents: number | null): PriceNote | null {
  const last = past.get(plain(description))
  if (!last || unitCents === null || unitCents === last.unitCents || last.unitCents === 0) return null
  return { ...last, changePercent: Math.round(((unitCents - last.unitCents) / last.unitCents) * 100) }
}
