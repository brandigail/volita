/** Today's date on the phone's own clock as YYYY-MM-DD, so "due today" means the owner's today and not UTC's. */
export function todayLocal(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
