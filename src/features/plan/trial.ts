const DAY_MS = 86_400_000

/** Whole days left, counting today, so "1 day left" means the last day rather than zero. */
export function daysLeft(endsAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY_MS))
}
