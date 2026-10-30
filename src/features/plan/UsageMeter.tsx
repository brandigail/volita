import { usePlan } from '../../providers/usePlan'

interface UsageMeterProps {
  /** Which allowance to show. */
  kind: 'drafts' | 'assistant'
}

/** "2 of 3 drafts left", counted over the last 24 hours. Turns amber when nearly used up. */
export function UsageMeter({ kind }: UsageMeterProps) {
  const { state } = usePlan()
  if (!state) return null
  const used = kind === 'drafts' ? state.usage.draftsUsed : state.usage.assistantUsed
  const limit = kind === 'drafts' ? state.usage.draftsLimit : state.usage.assistantLimit
  const left = Math.max(0, limit - used)
  const noun = kind === 'drafts' ? 'drafts' : 'assistant turns'
  const low = left <= Math.max(1, Math.floor(limit * 0.2))

  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        low ? 'border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'border-(--line) bg-(--surface) muted'
      }`}
      title="Counted over the last 24 hours"
    >
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-(--line)" aria-hidden="true">
        <span className="block h-full rounded-full bg-linear-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} />
      </span>
      {left} of {limit} {noun} left
    </p>
  )
}
