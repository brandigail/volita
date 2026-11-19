import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/business'
import { lastPrices, priceNote } from './price-memory'

const invoice = (number: string, createdAt: string, unitCents: number, status: Invoice['status'] = 'SENT', description = 'Geyser'): Invoice => ({
  id: number,
  number,
  contactId: null,
  customerName: 'X',
  customerPhone: '',
  customerEmail: '',
  items: [{ description, quantity: 1, unitCents }],
  vatRate: 0,
  subtotalCents: unitCents,
  vatCents: 0,
  totalCents: unitCents,
  status,
  issuedOn: createdAt.slice(0, 10),
  dueOn: createdAt.slice(0, 10),
  paidAt: null,
  remindersSent: 0,
  lastRemindedAt: null,
  note: '',
  createdAt,
})

describe('lastPrices', () => {
  it('keeps the newest price for each item, ignoring case and cancelled invoices', () => {
    const past = lastPrices([
      invoice('INV-0001', '2026-09-01T08:00:00Z', 450_000),
      invoice('INV-0002', '2026-10-01T08:00:00Z', 480_000, 'PAID', 'geyser'),
      invoice('INV-0003', '2026-11-01T08:00:00Z', 999_000, 'CANCELLED'),
    ])
    expect(past.get('geyser')).toEqual({ unitCents: 480_000, number: 'INV-0002' })
  })
})

describe('priceNote', () => {
  const past = lastPrices([invoice('INV-0002', '2026-10-01T08:00:00Z', 480_000)])

  it('says how far the new price is from last time', () => {
    expect(priceNote(past, 'Geyser', 510_000)).toEqual({ unitCents: 480_000, number: 'INV-0002', changePercent: 6 })
    expect(priceNote(past, ' geyser ', 432_000)?.changePercent).toBe(-10)
  })

  it('says nothing for a new item, the same price, or a price not typed yet', () => {
    expect(priceNote(past, 'Valve', 35_000)).toBeNull()
    expect(priceNote(past, 'Geyser', 480_000)).toBeNull()
    expect(priceNote(past, 'Geyser', null)).toBeNull()
  })
})
