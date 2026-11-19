import { describe, expect, it } from 'vitest'
import type { Expense } from '../types/scan'
import { expenseTotals } from './expenses'

const expense = (spentOn: string, totalCents: number, vatCents = 0): Expense => ({ id: spentOn + totalCents, spentOn, supplier: 'X', note: '', totalCents, vatCents, createdAt: `${spentOn}T08:00:00Z` })

describe('expenseTotals', () => {
  const all = [expense('2026-11-03', 10_000, 1_304), expense('2026-11-19', 5_000, 652), expense('2026-10-30', 7_000), expense('2026-02-28', 2_000), expense('2026-03-01', 3_000, 391), expense('2025-12-01', 99_000)]

  it('adds up the calendar month', () => {
    const totals = expenseTotals(all, '2026-11-19')
    expect(totals.monthCents).toBe(15_000)
    expect(totals.monthVatCents).toBe(1_956)
  })

  it('adds up the tax year that starts on 1 March, and leaves the year before out', () => {
    const totals = expenseTotals(all, '2026-11-19')
    expect(totals.taxYearLabel).toBe('2026/27')
    expect(totals.taxYearCents).toBe(10_000 + 5_000 + 7_000 + 3_000)
    expect(totals.taxYearVatCents).toBe(1_304 + 652 + 391)
  })

  it('knows January and February still belong to the tax year that began the March before', () => {
    const totals = expenseTotals(all, '2026-02-10')
    expect(totals.taxYearLabel).toBe('2025/26')
    expect(totals.taxYearCents).toBe(2_000 + 99_000)
  })
})
