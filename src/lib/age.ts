// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** Volita is for adults only. */
export const MIN_AGE = 18

const OLDEST_YEAR = 1900

/** A real calendar date written as YYYY-MM-DD, not in the future and not before 1900; otherwise null. */
export function parseBirthDate(value: unknown, now = new Date()): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  if (year < OLDEST_YEAR || date.getTime() > now.getTime()) return null
  return { year, month, day }
}

/** Whole years old on `now`'s date. */
export function ageOn(birth: { year: number; month: number; day: number }, now = new Date()): number {
  const [year, month, day] = [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()]
  const hadBirthday = month > birth.month || (month === birth.month && day >= birth.day)
  return year - birth.year - (hadBirthday ? 0 : 1)
}

/** True only for a valid date of birth of someone who is at least {@link MIN_AGE}. */
export function isAdult(value: unknown, now = new Date()): boolean {
  const birth = parseBirthDate(value, now)
  return birth !== null && ageOn(birth, now) >= MIN_AGE
}

export const UNDER_AGE_MESSAGE = `Sorry, Volita is only for people aged ${MIN_AGE} and over.`
export const BIRTH_DATE_NEEDED = 'Please enter your date of birth.'
export const ACCOUNT_CLOSED_MESSAGE = 'This account has been closed. If you think this is a mistake, contact support.'
