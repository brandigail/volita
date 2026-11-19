import { Briefcase, FileText, Settings, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { fetchBusinessSettings } from '../../lib/business-api'
import { usePlan } from '../../providers/usePlan'
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings, type CustomerSummary } from '../../types/business'
import { LockedPreview } from '../plan/LockedPreview'
import { CustomersPanel } from './CustomersPanel'
import { InvoicesPanel } from './InvoicesPanel'
import { SettingsPanel } from './SettingsPanel'

type Section = 'customers' | 'invoices' | 'settings'

const SECTIONS: { id: Section; label: string; icon: typeof Users }[] = [
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'settings', label: 'My details', icon: Settings },
]

/** A made-up example shown blurred behind the lock for people who are not on Pro. */
function Example() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold">Mrs Naidoo · owes R6 957.50</p>
      <p className="text-sm">INV-0012 · sent 12 Nov · 7 days overdue</p>
      <p className="text-sm">Quote: geyser and valve · sent 5 Nov</p>
      <p className="text-sm">Meeting: fit the geyser · Thursday 09:00</p>
    </div>
  )
}

/** The Business tab: customers with their story, invoices with VAT and a PDF, payment reminders, and the details printed on every invoice. */
export function BusinessView() {
  const { limits } = usePlan()
  const [section, setSection] = useState<Section>('customers')
  const [settings, setSettings] = useState<BusinessSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** A customer chosen on the Customers screen, to start an invoice for. */
  const [invoiceFor, setInvoiceFor] = useState<CustomerSummary | null>(null)

  useEffect(() => {
    if (!limits.business) return
    let cancelled = false
    fetchBusinessSettings()
      .then((loaded) => !cancelled && setSettings(loaded))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not load your business details.'))
    return () => {
      cancelled = true
    }
  }, [limits.business])

  const startInvoice = useCallback((customer: CustomerSummary) => {
    setInvoiceFor(customer)
    setSection('invoices')
  }, [])

  return (
    <section aria-labelledby="business-heading" className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <h1 id="business-heading" className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Briefcase className="size-7 text-brand-400" aria-hidden="true" />
          Business
        </h1>
        <p className="muted mt-1 text-sm">Your customers, what they owe, and the invoices you send them.</p>
      </div>

      {!limits.business ? (
        <LockedPreview title="Run the money side from here" pitch="Customers with their whole story, invoices with VAT and a PDF, and payment reminders you approve by voice.">
          <Example />
        </LockedPreview>
      ) : (
        <>
          <nav aria-label="Business sections" className="surface flex gap-1 rounded-2xl! p-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={section === id ? 'page' : undefined}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold ${section === id ? 'bg-brand-500/20 text-(--ink)' : 'muted hover:bg-brand-500/10'}`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>

          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          {section === 'customers' && <CustomersPanel onInvoice={startInvoice} />}
          {section === 'invoices' && <InvoicesPanel settings={settings ?? DEFAULT_BUSINESS_SETTINGS} invoiceFor={invoiceFor} onInvoiceStarted={() => setInvoiceFor(null)} onNeedDetails={() => setSection('settings')} />}
          {section === 'settings' && <SettingsPanel settings={settings ?? DEFAULT_BUSINESS_SETTINGS} onSaved={setSettings} />}
        </>
      )}
    </section>
  )
}
