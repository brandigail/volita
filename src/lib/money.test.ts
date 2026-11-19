import { describe, expect, it } from 'vitest'
import { addDaysTo, calcTotals, daysBetween, formatRand, invoiceNumber, nextChase, parseRand } from './money'

describe('calcTotals', () => {
  it('adds VAT on top of the items and rounds once', () => {
    const totals = calcTotals(
      [
        { description: 'Geyser', quantity: 1, unitCents: 480_000 },
        { description: 'Valve', quantity: 1, unitCents: 35_000 },
        { description: 'Labour', quantity: 2, unitCents: 45_000 },
      ],
      15,
    )
    expect(totals).toEqual({ subtotalCents: 605_000, vatCents: 90_750, totalCents: 695_750 })
  })

  it('adds nothing when the business is not VAT registered', () => {
    expect(calcTotals([{ description: 'Tap', quantity: 3, unitCents: 10_000 }], 0)).toEqual({ subtotalCents: 30_000, vatCents: 0, totalCents: 30_000 })
  })

  it('rounds fractional quantities to the cent', () => {
    expect(calcTotals([{ description: 'Pipe, per metre', quantity: 2.5, unitCents: 3_333 }], 0).subtotalCents).toBe(8_333)
  })
})

describe('formatRand and parseRand', () => {
  it('writes amounts the South African way', () => {
    expect(formatRand(695_750)).toBe('R6 957.50')
    expect(formatRand(5)).toBe('R0.05')
    expect(formatRand(123_456_789)).toBe('R1 234 567.89')
  })

  it('reads what people type', () => {
    expect(parseRand('R1 250,50')).toBe(125_050)
    expect(parseRand('450')).toBe(45_000)
    expect(parseRand('450.5')).toBe(45_050)
    expect(parseRand('abc')).toBeNull()
    expect(parseRand('')).toBeNull()
  })
})

describe('dates', () => {
  it('counts days and adds days across a month end', () => {
    expect(daysBetween('2026-11-01', '2026-11-19')).toBe(18)
    expect(addDaysTo('2026-11-28', 5)).toBe('2026-12-03')
  })

  it('numbers invoices with leading zeros', () => {
    expect(invoiceNumber(7)).toBe('INV-0007')
    expect(invoiceNumber(12345)).toBe('INV-12345')
  })
})

describe('nextChase', () => {
  it('suggests nothing before 7 days late', () => {
    expect(nextChase(6, 0)).toBeNull()
  })

  it('goes friendly, firmer, final as the days pass', () => {
    expect(nextChase(7, 0)).toBe(1)
    expect(nextChase(14, 1)).toBe(2)
    expect(nextChase(30, 2)).toBe(3)
  })

  it('does not jump ahead: a late invoice with no reminder still gets the first one', () => {
    expect(nextChase(45, 0)).toBe(1)
  })

  it('waits for the next day to come', () => {
    expect(nextChase(10, 1)).toBeNull()
  })

  it('stops after the third reminder', () => {
    expect(nextChase(90, 3)).toBeNull()
  })
})
