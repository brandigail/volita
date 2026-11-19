import type { Expense } from '../types/scan'

export interface ExpenseTotals {
  monthCents: number
  monthVatCents: number
  taxYearCents: number
  taxYearVatCents: number
  /** "2026/27", the South African tax year that runs from 1 March to the end of February. */
  taxYearLabel: string
}

/** The calendar month and the South African tax year (1 March to the end of February) that `today` (YYYY-MM-DD) falls in. */
export function expenseTotals(expenses: readonly Expense[], today: string): ExpenseTotals {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const startYear = month >= 3 ? year : year - 1
  const taxStart = `${startYear}-03-01`
  const taxEnd = `${startYear + 1}-03-01`
  const thisMonth = today.slice(0, 7)

  const sum = (inRange: (expense: Expense) => boolean, pick: (expense: Expense) => number) => expenses.filter(inRange).reduce((total, expense) => total + pick(expense), 0)
  const inMonth = (expense: Expense) => expense.spentOn.startsWith(thisMonth)
  const inTaxYear = (expense: Expense) => expense.spentOn >= taxStart && expense.spentOn < taxEnd
  return {
    monthCents: sum(inMonth, (expense) => expense.totalCents),
    monthVatCents: sum(inMonth, (expense) => expense.vatCents),
    taxYearCents: sum(inTaxYear, (expense) => expense.totalCents),
    taxYearVatCents: sum(inTaxYear, (expense) => expense.vatCents),
    taxYearLabel: `${startYear}/${String(startYear + 1).slice(2)}`,
  }
}
