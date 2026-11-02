import { formatDuration } from '../../lib/format'
interface RecordTimerProps {
  elapsedMs: number
  /** The plan's longest recording. */
  maxSeconds: number
}

export function RecordTimer({ elapsedMs, maxSeconds }: RecordTimerProps) {
  const maxMs = maxSeconds * 1000
  const percent = Math.min(100, (elapsedMs / maxMs) * 100)
  const nearLimit = elapsedMs >= maxMs - 10_000

  return (
    <div className="w-full max-w-xs">
      <p className="text-center font-mono text-4xl font-semibold tabular-nums">
        {formatDuration(elapsedMs)}
        <span className="muted text-base font-normal"> / {formatDuration(maxMs)}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Recording length"
        aria-valuemin={0}
        aria-valuemax={maxSeconds}
        aria-valuenow={Math.floor(elapsedMs / 1000)}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--line)"
      >
        <div
          className={`h-full rounded-full transition-[width] ${
            nearLimit ? 'bg-red-500' : 'bg-linear-to-r from-ember-700 via-ember-600 to-ember-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
