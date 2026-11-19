// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** Something the owner promised a customer in a message, with the day it is due. */
export interface Commitment {
  /** The sentence that makes the promise, as written. */
  sentence: string
  /** The day it is due, local to the owner, YYYY-MM-DD. */
  dueOn: string
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

/** "I'll send", "we will come", "I'm going to call", "I can drop it off": the owner takes something on. */
const COMMITMENT = /\b(?:i|we)(?:'ll|’ll| will| shall|'m going to|’m going to| am going to| can)\s+(?:\w+\s+){0,2}?(?:send|call|phone|come|bring|drop|deliver|fix|start|finish|complete|be there|be with you|visit|get back|email|whatsapp|text|quote|order|pay|see you|pop|install|collect|pick)\b/i

const SENTENCES = /[^.!?\n]+[.!?]?/g

const pad = (value: number) => String(value).padStart(2, '0')
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

function plusDays(from: Date, days: number): Date {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  next.setDate(next.getDate() + days)
  return next
}

/** When a sentence says it will happen, as a number of days from today, or null when it says no time. */
function daysAhead(sentence: string, now: Date): number | null {
  const text = sentence.toLowerCase()
  if (/\b(?:today|tonight|this afternoon|this evening)\b/.test(text)) return 0
  if (/\bday after tomorrow\b/.test(text)) return 2
  if (/\btomorrow\b/.test(text)) return 1
  const inDays = /\bin (\d{1,2}|a|one|two|three|four|five|six) (day|days|week|weeks)\b/.exec(text)
  if (inDays) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
    const count = words[inDays[1]] ?? Number(inDays[1])
    return count * (inDays[2].startsWith('week') ? 7 : 1)
  }
  const weekday = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(text))
  if (weekday >= 0) {
    const gap = (weekday - now.getDay() + 7) % 7
    // "Monday" said on a Monday means next Monday; "next Monday" is always the coming one, a week out at most.
    return gap === 0 ? 7 : gap
  }
  if (/\bnext week\b/.test(text)) return 7
  if (/\b(?:end of the week|this week|later this week)\b/.test(text)) return Math.max(1, (5 - now.getDay() + 7) % 7)
  return null
}

/**
 * The promises in a message: sentences where the owner says they will do something and say when. A sentence with no time is not a
 * promise to remind about, because there is no day to remind on. Gives at most three, the earliest first.
 */
export function findPromises(message: string, now: Date): Commitment[] {
  const found: Commitment[] = []
  for (const raw of message.match(SENTENCES) ?? []) {
    const sentence = raw.trim()
    if (sentence === '' || !COMMITMENT.test(sentence)) continue
    const ahead = daysAhead(sentence, now)
    if (ahead === null) continue
    found.push({ sentence: sentence.length > 140 ? `${sentence.slice(0, 137)}...` : sentence, dueOn: ymd(plusDays(now, ahead)) })
  }
  return found.sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, 3)
}
