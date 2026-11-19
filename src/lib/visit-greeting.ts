import { callName, pickGreeting } from './greeting'

const LAST_KEY = 'volita:last-greeting'

/** The greeting chosen for this visit (one page load), so every screen shows the same hello until the app is opened again. */
let visit: { name: string; line: string } | null = null

function readLast(): string {
  try {
    return localStorage.getItem(LAST_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeLast(line: string): void {
  try {
    localStorage.setItem(LAST_KEY, line)
  } catch {
    // Storage can be blocked; the next visit may then repeat a hello, which is harmless.
  }
}

/**
 * Today's hello for this visit, such as "Back at it again, Mayoman?". It is picked once each time the app is opened and
 * is never the same as the one shown on the previous visit. It changes at once if the person changes what they are called.
 */
export function visitGreeting(profile: { nickname: string; name: string }, now = new Date()): string {
  const name = callName(profile)
  if (visit?.name === name) return visit.line
  const line = pickGreeting(profile, now, readLast())
  writeLast(line)
  visit = { name, line }
  return line
}
