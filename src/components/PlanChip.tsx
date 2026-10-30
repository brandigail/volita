import { usePlan } from '../providers/usePlan'
import { planFor } from '../types/plans'

const TONE = {
  free: 'border-(--line) bg-(--surface)',
  basic: 'border-sky-400/50 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  pro: 'border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300',
} as const

/** The current plan in the header; tapping it opens the plans screen. */
export function PlanChip({ onClick }: { onClick: () => void }) {
  const { state } = usePlan()
  if (!state) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Your plan is ${planFor(state.plan).name}. See plans`}
      className={`mr-1 rounded-full border px-3 py-1 text-xs font-bold hover:brightness-110 ${TONE[state.plan]}`}
    >
      {planFor(state.plan).name}
    </button>
  )
}
