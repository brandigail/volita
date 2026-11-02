import { Lock } from 'lucide-react'
import { planFor, type PlanId } from '../types/plans'

interface UpgradeNoteProps {
  /** What is locked, in a sentence. */
  message: string
  /** The plan that unlocks it. */
  needs: PlanId
  /** Opens the plans screen; left out where there is nowhere to go. */
  onSeePlans?: () => void
}

/** A friendly lock, not an error: says what the plan includes and where to see the plans. */
export function UpgradeNote({ message, needs, onSeePlans }: UpgradeNoteProps) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 p-4 text-left text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden="true" />
      <div className="flex-1">
        <p>{message}</p>
        {onSeePlans && (
          <button type="button" onClick={onSeePlans} className="mt-2 font-semibold text-brand-700 dark:text-brand-400 underline underline-offset-2 hover:text-brand-400 dark:text-brand-300">
            See the {planFor(needs).name} plan
          </button>
        )}
      </div>
    </div>
  )
}
