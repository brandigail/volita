import { AlertCircle, Loader2, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { fetchInvoices } from '../../lib/business-api'
import { missingDetails } from '../../lib/invoice-text'
import { formatRand } from '../../lib/money'
import type { BusinessSettings, CustomerSummary, Invoice } from '../../types/business'
import { todayLocal } from './dates'
import { InvoiceDetail } from './InvoiceDetail'
import { lookOf, STATUS_LOOK } from './invoiceLook'
import { InvoiceForm } from './InvoiceForm'

interface InvoicesPanelProps {
  settings: BusinessSettings
  /** A customer to start a new invoice for, handed over from their page. */
  invoiceFor: CustomerSummary | null
  onInvoiceStarted: () => void
  onNeedDetails: () => void
}

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'open'; id: string }

/** The invoice list with what is owed at the top, the form for a new one and the detail of an open one. */
export function InvoicesPanel({ settings, invoiceFor, onInvoiceStarted, onNeedDetails }: InvoicesPanelProps) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>(invoiceFor ? { kind: 'new' } : { kind: 'list' })
  const [customer, setCustomer] = useState<CustomerSummary | null>(invoiceFor)
  const today = todayLocal()

  useEffect(() => {
    if (invoiceFor) onInvoiceStarted()
  }, [invoiceFor, onInvoiceStarted])

  const load = useCallback(() => {
    fetchInvoices()
      .then(setInvoices)
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : 'Could not load your invoices.'))
  }, [])
  useEffect(load, [load])

  const replace = (updated: Invoice) => setInvoices((current) => (current ? current.map((invoice) => (invoice.id === updated.id ? updated : invoice)) : [updated]))

  const owed = useMemo(() => {
    const open = (invoices ?? []).filter((invoice) => invoice.status === 'SENT')
    return {
      total: open.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      late: open.filter((invoice) => invoice.dueOn < today).reduce((sum, invoice) => sum + invoice.totalCents, 0),
    }
  }, [invoices, today])

  const missing = missingDetails(settings)
  const open = view.kind === 'open' ? invoices?.find((invoice) => invoice.id === view.id) : undefined

  if (view.kind === 'new') {
    return (
      <InvoiceForm
        settings={settings}
        customer={customer}
        onCancel={() => setView({ kind: 'list' })}
        onSaved={(invoice) => {
          setInvoices((current) => [invoice, ...(current ?? [])])
          setCustomer(null)
          setView({ kind: 'open', id: invoice.id })
        }}
      />
    )
  }
  if (open) {
    return (
      <InvoiceDetail
        invoice={open}
        settings={settings}
        onChange={replace}
        onBack={() => setView({ kind: 'list' })}
        onDeleted={(id) => {
          setInvoices((current) => (current ?? []).filter((invoice) => invoice.id !== id))
          setView({ kind: 'list' })
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="muted text-sm">Waiting to be paid</p>
          <p className="text-3xl font-extrabold">{formatRand(owed.total)}</p>
          {owed.late > 0 && <p className="text-sm font-semibold text-red-700 dark:text-red-300">{formatRand(owed.late)} of it is late</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            setCustomer(null)
            setView({ kind: 'new' })
          }}
          className="btn btn-primary"
        >
          <Plus className="size-4" aria-hidden="true" />
          New invoice
        </button>
      </div>

      {missing.length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Add {missing.join(' and ')} so your invoices are ready to send.{' '}
            <button type="button" onClick={onNeedDetails} className="font-semibold underline underline-offset-2">
              Open My details
            </button>
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {invoices === null && !error && (
        <p role="status" className="muted flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      )}
      {invoices?.length === 0 && <p className="muted text-sm">No invoices yet. Tap New invoice, or just tell the assistant: “Invoice Mrs Naidoo for the geyser, R4 800.”</p>}

      <ul className="flex flex-col gap-2">
        {invoices?.map((invoice) => {
          const look = STATUS_LOOK[lookOf(invoice, today)]
          return (
            <li key={invoice.id}>
              <button type="button" onClick={() => setView({ kind: 'open', id: invoice.id })} className="surface flex w-full items-center justify-between gap-3 p-4 text-left hover:border-brand-400/70">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{invoice.customerName}</span>
                  <span className="muted block text-xs">{invoice.number}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-bold">{formatRand(invoice.totalCents)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${look.colour}`}>{look.word}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
