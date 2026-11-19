import { todayLocal } from './dates'

/** What is already known about an expense, from a scanned receipt or nothing. Amounts are written the way a person types them. */
export interface ExpenseDraft {
  supplier: string
  spentOn: string
  total: string
  vat: string
}

export const blankExpense = (): ExpenseDraft => ({ supplier: '', spentOn: todayLocal(), total: '', vat: '' })
