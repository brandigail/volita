const KEY = 'volita:welcomed'

/** Today's date on the person's own clock, as YYYY-MM-DD. */
export function localDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * True the first time it is asked on a given day, on this device. The spoken "Welcome back" uses it so the personal
 * welcome happens once a day instead of costing a premium voice turn at the start of every conversation.
 */
export function takeDailyWelcome(now = new Date()): boolean {
  const today = localDate(now)
  try {
    if (localStorage.getItem(KEY) === today) return false
    localStorage.setItem(KEY, today)
    return true
  } catch {
    // Storage can be blocked; then the usual short greeting is used rather than welcoming every time.
    return false
  }
}
