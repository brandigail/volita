import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { ApiRequestError } from '../../lib/api'
import { createInvoice, fetchCustomers } from '../../lib/business-api'
import { addDaysTo, calcTotals, formatRand, parseRand } from '../../lib/money'
import { BUSINESS_LIMITS, type BusinessSettings, type CustomerSummary, type Invoice } from '../../types/business'
import { todayLocal } from './dates'

interface Row {
  description: string
  quantity: string
  price: string
}

const EMPTY_ROW: Row = { description: '', quantity: '1', price: '' }

interface InvoiceFormProps {
  settings: BusinessSettings
  /** A customer to fill in, when the invoice is started from their page. */
  customer: CustomerSummary | null
  onSaved: (invoice: Invoice) => void
  onCancel: () => void
}

/** Makes an invoice as a draft. Prices are entered without VAT; the VAT line is worked out and added when the business is VAT registered. */
export function InvoiceForm({ settings, customer, onSaved, onCancel }: InvoiceFormProps) {
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }])
  const [addVat, setAddVat] = useState(settings.vatRegistered)
  const [dueOn, setDueOn] = useState(() => addDaysTo(todayLocal(), settings.paymentTermsDays))
  const [note, setNote] = useState('')
  const [known, setKnown] = useState<CustomerSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCustomers()
      .then((list) => !cancelled && setKnown(list))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const items = rows.flatMap((row) => {
    const unitCents = parseRand(row.price)
    const quantity = Number(row.quantity.replace(',', '.'))
    return row.description.trim() !== '' && unitCents !== null && quantity > 0 ? [{ description: row.description.trim(), quantity, unitCents }] : []
  })
  const vatRate = addVat ? 15 : 0
  const totals = calcTotals(items, vatRate)

  const pickName = (value: string) => {
    setName(value)
    const match = known.find((candidate) => candidate.name.toLowerCase() === value.trim().toLowerCase())
    if (match) {
      setPhone(match.phone)
      setEmail(match.email)
    }
  }
  const setRow = (index: number, patch: Partial<Row>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') return setError('Who is the invoice for?')
    if (items.length === 0) return setError('Add at least one item with a price, for example 450 or 1 250.')
    setBusy(true)
    setError(null)
    try {
      const match = known.find((candidate) => candidate.name.toLowerCase() === name.trim().toLowerCase())
      onSaved(await createInvoice({ customerName: name.trim(), customerPhone: phone.trim(), customerEmail: email.trim(), contactId: match?.id ?? customer?.id ?? null, items, vatRate, issuedOn: todayLocal(), dueOn, note: note.trim() }))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save the invoice. Please try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="surface flex flex-col gap-4 p-5">
      <h2 className="text-xl font-extrabold">New invoice</h2>

      <div>
        <label htmlFor="inv-name" className="mb-1.5 block text-sm font-semibold">
          Customer
        </label>
        <input id="inv-name" className="field" list="inv-known" value={name} maxLength={BUSINESS_LIMITS.customerName} onChange={(e) => pickName(e.target.value)} autoComplete="off" />
        <datalist id="inv-known">
          {known.map((candidate) => (
            <option key={candidate.id} value={candidate.name} />
          ))}
        </datalist>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="inv-phone" className="mb-1.5 block text-sm font-semibold">
            WhatsApp number <span className="muted font-normal">(optional)</span>
          </label>
          <input id="inv-phone" className="field" type="tel" value={phone} maxLength={BUSINESS_LIMITS.customerPhone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label htmlFor="inv-email" className="mb-1.5 block text-sm font-semibold">
            Email <span className="muted font-normal">(optional)</span>
          </label>
          <input id="inv-email" className="field" type="email" value={email} maxLength={BUSINESS_LIMITS.customerEmail} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Items (price without VAT)</legend>
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_4rem_6.5rem_2.75rem] items-center gap-2">
            <input aria-label={`Item ${index + 1} description`} className="field" placeholder="What" value={row.description} maxLength={BUSINESS_LIMITS.description} onChange={(e) => setRow(index, { description: e.target.value })} />
            <input aria-label={`Item ${index + 1} quantity`} className="field px-2 text-center" inputMode="decimal" value={row.quantity} onChange={(e) => setRow(index, { quantity: e.target.value })} />
            <input aria-label={`Item ${index + 1} price`} className="field px-2 text-right" inputMode="decimal" placeholder="R 0.00" value={row.price} onChange={(e) => setRow(index, { price: e.target.value })} />
            <button type="button" aria-label={`Remove item ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((_, i) => i !== index))} className="btn btn-ghost px-0">
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" disabled={rows.length >= BUSINESS_LIMITS.items} onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])} className="btn btn-ghost self-start">
          <Plus className="size-4" aria-hidden="true" />
          Add an item
        </button>
      </fieldset>

      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="size-5 accent-orange-600" checked={addVat} onChange={(e) => setAddVat(e.target.checked)} />
        Add 15% VAT on top
      </label>

      <div className="flex flex-col gap-1 rounded-2xl bg-brand-500/10 p-3 text-sm" aria-live="polite">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRand(totals.subtotalCents)}</span>
        </p>
        {addVat && (
          <p className="flex justify-between">
            <span>VAT 15%</span>
            <span>{formatRand(totals.vatCents)}</span>
          </p>
        )}
        <p className="flex justify-between text-base font-extrabold">
          <span>Total</span>
          <span>{formatRand(totals.totalCents)}</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="inv-due" className="mb-1.5 block text-sm font-semibold">
            Payment due
          </label>
          <input id="inv-due" type="date" className="field" value={dueOn} onChange={(e) => setDueOn(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="inv-note" className="mb-1.5 block text-sm font-semibold">
            Note <span className="muted font-normal">(optional)</span>
          </label>
          <input id="inv-note" className="field" value={note} maxLength={BUSINESS_LIMITS.note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save invoice
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}
