import { Camera, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { expenseTotals } from '../../lib/expenses'
import { formatRand } from '../../lib/money'
import { deleteExpense, fetchExpenses, scanReceipt } from '../../lib/scan-api'
import type { Expense } from '../../types/scan'
import { todayLocal } from './dates'
import { blankExpense, type ExpenseDraft } from './expenseDraft'
import { ExpenseForm } from './ExpenseForm'

const prettyDay = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
const centsToText = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2))

/** Expenses: scan a receipt (or type one in), and see what has been spent this month and this tax year, VAT included. */
export function ExpensesPanel() {
  const input = useRef<HTMLInputElement>(null)
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  const [editing, setEditing] = useState<{ draft: ExpenseDraft; scanned: boolean } | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchExpenses()
      .then((list) => !cancelled && setExpenses(list))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not load your expenses.'))
    return () => {
      cancelled = true
    }
  }, [])

  const totals = useMemo(() => expenseTotals(expenses ?? [], todayLocal()), [expenses])

  const scan = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    setError(null)
    try {
      const read = await scanReceipt(file)
      setEditing({ scanned: true, draft: { supplier: read.supplier, spentOn: read.date || todayLocal(), total: centsToText(read.totalCents), vat: centsToText(read.vatCents) } })
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not read that receipt. Please try again or add it by hand.')
    } finally {
      setReading(false)
      if (input.current) input.current.value = ''
    }
  }
  const remove = async (id: string) => {
    try {
      await deleteExpense(id)
      setExpenses((current) => (current ?? []).filter((expense) => expense.id !== id))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete that. Please try again.')
    }
  }

  if (editing) {
    return (
      <ExpenseForm
        initial={editing.draft}
        scanned={editing.scanned}
        onCancel={() => setEditing(null)}
        onSaved={(expense) => {
          setExpenses((current) => [expense, ...(current ?? [])].sort((a, b) => b.spentOn.localeCompare(a.spentOn)))
          setEditing(null)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="surface grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <p className="muted text-sm">This month</p>
          <p className="text-2xl font-extrabold">{formatRand(totals.monthCents)}</p>
          <p className="muted text-xs">VAT {formatRand(totals.monthVatCents)}</p>
        </div>
        <div>
          <p className="muted text-sm">Tax year {totals.taxYearLabel} (1 March to end February)</p>
          <p className="text-2xl font-extrabold">{formatRand(totals.taxYearCents)}</p>
          <p className="muted text-xs">VAT {formatRand(totals.taxYearVatCents)}</p>
        </div>
      </div>

      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void scan(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={reading} className="btn btn-primary">
          {reading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
          {reading ? 'Reading the receipt…' : 'Scan a receipt'}
        </button>
        <button type="button" onClick={() => setEditing({ draft: blankExpense(), scanned: false })} className="btn btn-ghost">
          <Plus className="size-4" aria-hidden="true" />
          Add by hand
        </button>
      </div>
      <p className="muted text-xs">The photo is read once and thrown away. Only the supplier, date and amounts you confirm are saved.</p>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {expenses === null && !error && (
        <p role="status" className="muted flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      )}
      {expenses?.length === 0 && <p className="muted text-sm">No expenses yet. Scan a till slip and it is added in a few seconds.</p>}
      <ul className="flex flex-col gap-2">
        {expenses?.map((expense) => (
          <li key={expense.id} className="surface flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{expense.supplier}</p>
              <p className="muted truncate text-xs">
                {prettyDay(expense.spentOn)}
                {expense.note ? ` · ${expense.note}` : ''}
                {expense.vatCents > 0 ? ` · VAT ${formatRand(expense.vatCents)}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-bold">{formatRand(expense.totalCents)}</span>
              <button type="button" onClick={() => void remove(expense.id)} aria-label={`Delete the ${expense.supplier} expense`} className="btn btn-ghost px-2">
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
