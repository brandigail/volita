export interface BirthDateParts {
  day: string
  month: string
  year: string
}

export const EMPTY_BIRTH_DATE: BirthDateParts = { day: '', month: '', year: '' }

/** "YYYY-MM-DD" once all three parts are chosen, otherwise null. */
export function birthDateValue(parts: BirthDateParts): string | null {
  if (!parts.day || !parts.month || !parts.year) return null
  return `${parts.year}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')}`
}
