/**
 * The assistant searches email with Gmail's search words (from:jan newer_than:7d is:unread subject:quote ...). Gmail
 * understands them directly; for the other services they are read into this shape first and translated.
 */

export interface MailQuery {
  from: string[]
  to: string[]
  subject: string[]
  /** Plain words, searched in the subject, the sender and the text. */
  words: string[]
  /** Only mail received on or after this moment. */
  since: Date | null
  /** Only mail received before this moment. */
  before: Date | null
  unread: boolean | null
  folder: 'inbox' | 'sent'
}

const DAY_MS = 86_400_000
const UNIT_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 }

/** Splits into terms, keeping "quoted phrases" and key:"quoted values" together. */
function terms(query: string): string[] {
  return [...query.matchAll(/(\w+:)?"([^"]*)"|\S+/g)].map((match) => (match[2] !== undefined ? `${match[1] ?? ''}${match[2]}` : match[0]))
}

function relative(value: string, now: number): Date | null {
  const match = /^(\d{1,4})([dwmy])$/i.exec(value)
  return match ? new Date(now - Number(match[1]) * UNIT_DAYS[match[2].toLowerCase()] * DAY_MS) : null
}

function absolute(value: string): Date | null {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

export function parseMailQuery(query: string, now = Date.now()): MailQuery {
  const parsed: MailQuery = { from: [], to: [], subject: [], words: [], since: null, before: null, unread: null, folder: 'inbox' }
  for (const term of terms(query.slice(0, 200))) {
    const colon = term.indexOf(':')
    const key = colon > 0 ? term.slice(0, colon).toLowerCase() : ''
    const value = colon > 0 ? term.slice(colon + 1).trim() : term
    if (!value) continue
    switch (key) {
      case 'from':
        parsed.from.push(value)
        break
      case 'to':
        parsed.to.push(value)
        break
      case 'subject':
        parsed.subject.push(value)
        break
      case 'newer_than':
        parsed.since = relative(value, now) ?? parsed.since
        break
      case 'older_than':
        parsed.before = relative(value, now) ?? parsed.before
        break
      case 'after':
        parsed.since = absolute(value) ?? parsed.since
        break
      case 'before':
        parsed.before = absolute(value) ?? parsed.before
        break
      case 'is':
        if (/^unread$/i.test(value)) parsed.unread = true
        else if (/^read$/i.test(value)) parsed.unread = false
        break
      case 'in':
        if (/^sent$/i.test(value)) parsed.folder = 'sent'
        break
      case 'has':
      case 'label':
      case 'category':
        // Gmail-only ideas; other services have no equivalent, so they are left out rather than guessed.
        break
      default:
        parsed.words.push(term)
    }
  }
  return parsed
}
