import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiRequestError } from '../../lib/api'
import { parseRand } from '../../lib/money'
import { saveExpense } from '../../lib/scan-api'
import { EXPENSE_LIMITS, type Expense } from '../../types/scan'
import type { ExpenseDraft } from './expenseDraft'

interface ExpenseFormProps {
  initial: ExpenseDraft
  /** True when the fields came from a photo, so the person knows to check them. */
  scanned: boolean
  onSaved: (expense: Expense) => void
  onCancel: () => void
}

/** Checks and saves an expense. A scanned receipt fills it in, but the person always sees and can change every field first. */
export function ExpenseForm({ initial, scanned, onSaved, onCancel }: ExpenseFormProps) {
  const [form, setForm] = useState(initial)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof ExpenseDraft) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const totalCents = parseRand(form.total)
    const vatCents = form.vat.trim() === '' ? 0 : parseRand(form.vat)
    if (form.supplier.trim() === '') return setError('Who was it paid to?')
    if (totalCents === null || totalCents < 1) return setError('Type the total, for example 245.50.')
    if (vatCents === null) return setError('The VAT must be an amount, for example 32.02, or empty.')
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveExpense({ spentOn: form.spentOn, supplier: form.supplier.trim(), note: note.trim(), totalCents, vatCents }))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save. Please try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="surface flex flex-col gap-3 p-5">
      <h2 className="text-xl font-extrabold">{scanned ? 'Check this receipt' : 'Add an expense'}</h2>
      {scanned && <p className="muted text-sm">Volita read this from the photo. Please check the supplier, date and amounts before you save.</p>}
      <div>
        <label htmlFor="exp-supplier" className="mb-1.5 block text-sm font-semibold">
          Paid to
        </label>
        <input id="exp-supplier" className="field" value={form.supplier} maxLength={EXPENSE_LIMITS.supplier} onChange={(e) => set('supplier')(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="exp-date" className="mb-1.5 block text-sm font-semibold">
            Date
          </label>
          <input id="exp-date" type="date" className="field" required value={form.spentOn} onChange={(e) => set('spentOn')(e.target.value)} />
        </div>
        <div>
          <label htmlFor="exp-total" className="mb-1.5 block text-sm font-semibold">
            Total
          </label>
          <input id="exp-total" className="field" inputMode="decimal" placeholder="R 0.00" value={form.total} onChange={(e) => set('total')(e.target.value)} />
        </div>
        <div>
          <label htmlFor="exp-vat" className="mb-1.5 block text-sm font-semibold">
            VAT <span className="muted font-normal">(if shown)</span>
          </label>
          <input id="exp-vat" className="field" inputMode="decimal" placeholder="R 0.00" value={form.vat} onChange={(e) => set('vat')(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="exp-note" className="mb-1.5 block text-sm font-semibold">
          What was it for? <span className="muted font-normal">(optional)</span>
        </label>
        <input id="exp-note" className="field" value={note} maxLength={EXPENSE_LIMITS.note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save expense
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}
