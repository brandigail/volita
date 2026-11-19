import { WEEKDAYS, type BookingHours } from '../../../src/types/booking.ts'
import { addDays, todayIn, zonedToDate } from './time.ts'

export interface SlotRules {
  slotMinutes: number
  daysAhead: number
  minNoticeHours: number
  hours: BookingHours
  timeZone: string
}

/** Time already taken: bookings, and meetings on the owner's own agenda. */
export interface Busy {
  start: Date
  end: Date
}

const MS_PER_MINUTE = 60_000
const toMinutes = (clock: string): number => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))
const clockOf = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** The day of the week of a calendar date (YYYY-MM-DD), which is the same in every time zone. */
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

/**
 * The start times a customer may pick, day by day. A slot is free when it is inside the owner's hours for that weekday, is far enough
 * ahead, and does not overlap anything already booked or on their agenda. Days with nothing free are left out.
 */
export function generateSlots(rules: SlotRules, now: Date, busy: readonly Busy[]): { date: string; slots: string[] }[] {
  const earliest = now.getTime() + rules.minNoticeHours * 60 * MS_PER_MINUTE
  const days: { date: string; slots: string[] }[] = []

  for (let offset = 0; offset <= rules.daysAhead; offset++) {
    const date = todayIn(rules.timeZone, addDays(now, offset))
    const window = rules.hours[weekdayOf(date)]
    if (!window) continue
    const slots: string[] = []
    for (let minute = toMinutes(window.start); minute + rules.slotMinutes <= toMinutes(window.end); minute += rules.slotMinutes) {
      const start = zonedToDate(`${date}T${clockOf(minute)}`, rules.timeZone)
      if (!start || start.getTime() < earliest) continue
      const end = start.getTime() + rules.slotMinutes * MS_PER_MINUTE
      if (busy.some((taken) => start.getTime() < taken.end.getTime() && end > taken.start.getTime())) continue
      slots.push(start.toISOString())
    }
    if (slots.length > 0) days.push({ date, slots })
  }
  return days
}
