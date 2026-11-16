import { useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { startTrial } from '../../lib/growth-api'
import { usePlan } from '../../providers/usePlan'

/** Starts the free Pro trial: no card, once per account. The plan reloads, so every Pro feature opens at once. */
export function StartTrialButton({ className = 'btn btn-primary' }: { className?: string }) {
  const { state, refresh } = usePlan()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!state?.trial.available) return null

  async function start() {
    setBusy(true)
    setError(null)
    try {
      await startTrial()
      refresh()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start the trial. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button type="button" className={className} disabled={busy} onClick={() => void start()}>
        {busy ? 'Starting…' : `Try Pro free for ${state.trial.lengthDays} days`}
      </button>
      {error && (
        <span role="alert" className="text-xs font-semibold text-red-700 dark:text-red-200">
          {error}
        </span>
      )}
    </span>
  )
}
