import { ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchSafetyEvents } from '../../lib/plan-api'
import { SAFETY_KIND_LABEL, type SafetyEvent } from '../../types/safety'

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const SHOWN = 20

/** Owner only: the newest things the safety checks stopped. Only what kind and where, never what was typed or said. */
export function SafetyAlerts({ refreshKey }: { refreshKey: number }) {
  const [events, setEvents] = useState<SafetyEvent[] | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchSafetyEvents()
      .then((list) => !cancelled && setEvents(list))
      .catch(() => !cancelled && setEvents([]))
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (!events || events.length === 0) return null
  const shown = showAll ? events : events.slice(0, SHOWN)

  return (
    <div className="surface mb-4 border-amber-500/40 p-4" data-testid="safety-alerts">
      <h3 className="flex items-center gap-2 font-bold">
        <ShieldAlert className="size-5 text-amber-500" aria-hidden="true" />
        Safety alerts (last 30 days)
      </h3>
      <p className="muted mt-1 text-xs">Blocked tries with card numbers, bank details or passwords, people pushing past the limits, and too many emails. What they typed or said is never kept.</p>
      <ul className="mt-3 max-h-72 divide-y divide-(--line) overflow-y-auto text-sm">
        {shown.map((event) => (
          <li key={event.id} className="py-2">
            <p>
              <span className="font-semibold">{SAFETY_KIND_LABEL[event.kind]}</span> · {event.name || event.email}
            </p>
            <p className="muted text-xs">
              {event.email} · {event.source} · {timeFormat.format(new Date(event.createdAt))}
            </p>
          </li>
        ))}
      </ul>
      {events.length > SHOWN && (
        <button type="button" className="btn btn-ghost mt-2 text-xs" onClick={() => setShowAll((all) => !all)}>
          {showAll ? 'Show fewer' : `Show all ${events.length}`}
        </button>
      )}
    </div>
  )
}
