import { BellPlus, Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { addAgendaItem } from '../../lib/agenda-api'
import { ApiRequestError } from '../../lib/api'
import { findPromises, type Commitment } from '../../lib/promises'

interface PromiseOfferProps {
  /** The message as written, so a promise the owner makes in it (or adds while editing) is noticed. */
  body: string
  recipient: string
}

const REMINDER_HOUR = 8
const REMINDER_MINUTES = 30

const prettyDay = (dueOn: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${dueOn}T12:00:00`))

function startOf(dueOn: string): Date {
  const [year, month, day] = dueOn.split('-').map(Number)
  return new Date(year, month - 1, day, REMINDER_HOUR, 0)
}

/** Spots "I'll send it tomorrow" in a message and offers to put a reminder on the agenda, so the promise is not forgotten. */
export function PromiseOffer({ body, recipient }: PromiseOfferProps) {
  const promises = useMemo(() => findPromises(body, new Date()), [body])
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  if (promises.length === 0) return null

  const keyOf = (promise: Commitment) => `${promise.dueOn}|${promise.sentence}`
  const add = async (promise: Commitment) => {
    setError(null)
    const start = startOf(promise.dueOn)
    try {
      await addAgendaItem({
        title: `Promised ${recipient || 'a customer'}: ${promise.sentence}`,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + REMINDER_MINUTES * 60_000).toISOString(),
        notes: 'Added by Volita from a message you wrote.',
      })
      setAdded((current) => new Set(current).add(keyOf(promise)))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not add the reminder. Please try again.')
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-brand-500/40 bg-brand-500/10 p-3 text-sm" data-testid="promise-offer">
      <p className="font-semibold">Remind me to keep this promise?</p>
      {promises.map((promise) => {
        const done = added.has(keyOf(promise))
        return (
          <div key={keyOf(promise)} className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1">
              <span className="muted">{prettyDay(promise.dueOn)}: </span>“{promise.sentence}”
            </p>
            <button type="button" onClick={() => void add(promise)} disabled={done} className="btn btn-ghost px-3 py-1.5 text-xs">
              {done ? <Check className="size-4" aria-hidden="true" /> : <BellPlus className="size-4" aria-hidden="true" />}
              {done ? 'On your agenda' : 'Add to agenda'}
            </button>
          </div>
        )
      })}
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
