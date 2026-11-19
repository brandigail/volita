import { ArrowLeft, CalendarDays, FileText, Loader2, MessageSquare, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { fetchCustomers, fetchCustomerStory } from '../../lib/business-api'
import { plain } from '../../lib/customer-match'
import { formatRand } from '../../lib/money'
import type { CustomerStory, CustomerSummary, TimelineKind } from '../../types/business'
import { ContactImport } from '../memory/ContactImport'
import { CardScan } from './CardScan'

const KIND_ICON: Record<TimelineKind, typeof FileText> = {
  draft: MessageSquare,
  invoice: FileText,
  agenda: CalendarDays,
  promise: CalendarDays,
  booking: CalendarDays,
}

const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

interface CustomersPanelProps {
  onInvoice: (customer: CustomerSummary) => void
}

/** The people Volita knows, with what each owes. Open one to see everything that has happened with them. */
export function CustomersPanel({ onInvoice }: CustomersPanelProps) {
  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [story, setStory] = useState<CustomerStory | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Bumped to load the list again, for example after a business card was saved. */
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchCustomers()
      .then((list) => !cancelled && setCustomers(list))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not load your customers.'))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  useEffect(() => {
    if (openId === null) return
    let cancelled = false
    fetchCustomerStory(openId)
      .then((loaded) => !cancelled && setStory(loaded))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not load that customer.'))
    return () => {
      cancelled = true
    }
  }, [openId])

  const shown = useMemo(() => (customers ?? []).filter((customer) => plain(customer.name).includes(plain(query))), [customers, query])

  if (openId !== null) {
    return (
      <article className="surface flex flex-col gap-4 p-5" aria-label="Customer story">
        <button
          type="button"
          onClick={() => {
            setOpenId(null)
            setStory(null)
          }}
          className="btn btn-ghost self-start"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All customers
        </button>
        {!story && !error && (
          <p role="status" className="muted flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        {story && (
          <>
            <div>
              <h2 className="text-xl font-extrabold">{story.customer.name}</h2>
              <p className="muted text-sm">{[story.customer.phone, story.customer.email].filter(Boolean).join(' · ') || 'No phone or email saved'}</p>
              {story.notes && <p className="mt-2 text-sm">{story.notes}</p>}
              {story.customer.owedCents > 0 && <p className="mt-2 font-semibold text-red-700 dark:text-red-300">Owes {formatRand(story.customer.owedCents)}</p>}
            </div>
            <button type="button" onClick={() => onInvoice(story.customer)} className="btn btn-primary self-start">
              New invoice for {story.customer.name.split(' ')[0]}
            </button>
            {story.timeline.length === 0 ? (
              <p className="muted text-sm">Nothing yet. Quotes, messages, meetings and invoices that mention {story.customer.name} appear here.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {story.timeline.map((entry) => {
                  const Icon = KIND_ICON[entry.kind]
                  return (
                    <li key={`${entry.kind}-${entry.id}`} className="flex gap-3">
                      <Icon className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{entry.title}</p>
                        <p className="muted text-xs">
                          {when(entry.at)} · {entry.detail}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        )}
      </article>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <CardScan onSaved={() => setReloadKey((current) => current + 1)} />
      <ContactImport existing={customers ?? []} onImported={() => setReloadKey((current) => current + 1)} />
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 muted" aria-hidden="true" />
        <input aria-label="Search customers" className="field pl-9" placeholder="Search customers" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {customers === null && !error && (
        <p role="status" className="muted flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      )}
      {customers?.length === 0 && <p className="muted text-sm">No customers yet. People you save in Profile, “What Volita knows about you”, appear here, or ask the assistant to remember one.</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((customer) => (
          <li key={customer.id}>
            <button type="button" onClick={() => setOpenId(customer.id)} className="surface flex w-full items-center justify-between gap-3 p-4 text-left hover:border-brand-400/70">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{customer.name}</span>
                <span className="muted block text-xs">{customer.lastAt ? `Last: ${when(customer.lastAt)}` : 'Nothing yet'}</span>
              </span>
              {customer.owedCents > 0 && <span className="shrink-0 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-800 dark:text-red-300">Owes {formatRand(customer.owedCents)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
