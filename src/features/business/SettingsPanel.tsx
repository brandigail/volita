import { Check, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiRequestError } from '../../lib/api'
import { saveBusinessSettings } from '../../lib/business-api'
import { BUSINESS_LIMITS, type BusinessSettings } from '../../types/business'

interface SettingsPanelProps {
  settings: BusinessSettings
  onSaved: (settings: BusinessSettings) => void
}

/** The details printed on every invoice. The bank details stay in the app and on the invoices: they are never sent to the AI. */
export function SettingsPanel({ settings, onSaved }: SettingsPanelProps) {
  const [form, setForm] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) => {
    setSaved(false)
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveBusinessSettings(form))
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="surface flex flex-col gap-4 p-5">
      <h2 className="text-xl font-extrabold">My business details</h2>
      <p className="muted text-sm">Printed on every invoice. Only you can see them, and they are stored scrambled.</p>

      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="size-5 accent-orange-600" checked={form.vatRegistered} onChange={(e) => set('vatRegistered', e.target.checked)} />
        My business is registered for VAT
      </label>
      {form.vatRegistered && (
        <div>
          <label htmlFor="biz-vat" className="mb-1.5 block text-sm font-semibold">
            VAT number
          </label>
          <input id="biz-vat" className="field" inputMode="numeric" value={form.vatNumber} maxLength={BUSINESS_LIMITS.vatNumber} onChange={(e) => set('vatNumber', e.target.value)} />
          <p className="muted mt-1 text-xs">Invoices then say “Tax invoice” and add 15% VAT on top of your prices.</p>
        </div>
      )}

      <div>
        <label htmlFor="biz-bank" className="mb-1.5 block text-sm font-semibold">
          Banking details
        </label>
        <textarea
          id="biz-bank"
          className="field min-h-24"
          value={form.bankDetails}
          maxLength={BUSINESS_LIMITS.bank}
          placeholder={'Bank, account name, account number and branch code, so customers can pay by EFT'}
          onChange={(e) => set('bankDetails', e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="biz-terms" className="mb-1.5 block text-sm font-semibold">
          Days to pay
        </label>
        <input id="biz-terms" type="number" min={0} max={90} className="field" value={form.paymentTermsDays} onChange={(e) => set('paymentTermsDays', Math.max(0, Math.min(90, Math.round(Number(e.target.value) || 0))))} />
        <p className="muted mt-1 text-xs">An invoice is due this many days after you make it. Payment reminders start 7 days after the due date.</p>
      </div>

      <div>
        <label htmlFor="biz-note" className="mb-1.5 block text-sm font-semibold">
          A line at the bottom of every invoice <span className="muted font-normal">(optional)</span>
        </label>
        <input id="biz-note" className="field" value={form.invoiceNote} maxLength={BUSINESS_LIMITS.note} placeholder="For example: Thank you for your business" onChange={(e) => set('invoiceNote', e.target.value)} />
      </div>

      <div>
        <label htmlFor="biz-review" className="mb-1.5 block text-sm font-semibold">
          Your Google review link <span className="muted font-normal">(optional)</span>
        </label>
        <input id="biz-review" type="url" className="field" value={form.reviewLink} maxLength={BUSINESS_LIMITS.link} placeholder="https://g.page/r/…" onChange={(e) => set('reviewLink', e.target.value)} />
        <p className="muted mt-1 text-xs">Used when you ask a happy customer for a review.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save details
        </button>
        {saved && (
          <p role="status" className="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-300">
            <Check className="size-4" aria-hidden="true" />
            Saved
          </p>
        )}
      </div>
    </form>
  )
}
