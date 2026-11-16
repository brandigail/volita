import { MIN_AGE } from '../../lib/age'
import type { BirthDateParts } from './birthDate'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const thisYear = new Date().getFullYear()
const YEARS = Array.from({ length: 100 }, (_, i) => thisYear - i)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

interface BirthDateFieldsProps {
  value: BirthDateParts
  onChange: (next: BirthDateParts) => void
  idPrefix: string
}

/** Day, month and year as three lists: quicker on a phone than scrolling a calendar back decades. */
export function BirthDateFields({ value, onChange, idPrefix }: BirthDateFieldsProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-semibold">Date of birth</legend>
      <div className="grid grid-cols-[1fr_1.35fr_1.15fr] gap-2">
        <select aria-label="Day" id={`${idPrefix}-day`} required value={value.day} onChange={(e) => onChange({ ...value, day: e.target.value })} className="field px-2.5">
          <option value="">Day</option>
          {DAYS.map((day) => (
            <option key={day} value={String(day)}>
              {day}
            </option>
          ))}
        </select>
        <select aria-label="Month" id={`${idPrefix}-month`} required value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })} className="field px-2.5">
          <option value="">Month</option>
          {MONTHS.map((month, index) => (
            <option key={month} value={String(index + 1)}>
              {month}
            </option>
          ))}
        </select>
        <select aria-label="Year" id={`${idPrefix}-year`} required value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value })} className="field px-2.5">
          <option value="">Year</option>
          {YEARS.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <p className="muted mt-1 text-xs">Volita is only for people aged {MIN_AGE} and over.</p>
    </fieldset>
  )
}
