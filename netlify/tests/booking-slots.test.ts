import { describe, expect, it } from 'vitest'
import { generateSlots, weekdayOf, type SlotRules } from '../functions/_lib/booking-slots.ts'

// Thursday 19 November 2026, 10:00 in Johannesburg (08:00 UTC).
const now = new Date('2026-11-19T08:00:00Z')
const rules: SlotRules = {
  slotMinutes: 60,
  daysAhead: 7,
  minNoticeHours: 0,
  timeZone: 'Africa/Johannesburg',
  hours: { mon: { start: '08:00', end: '12:00' }, thu: { start: '08:00', end: '12:00' }, fri: { start: '09:00', end: '11:00' } },
}
const at = (date: string, clock: string) => new Date(`${date}T${clock}:00+02:00`).toISOString()

describe('weekdayOf', () => {
  it('names the weekday of a calendar date', () => {
    expect(weekdayOf('2026-11-19')).toBe('thu')
    expect(weekdayOf('2026-11-22')).toBe('sun')
  })
})

describe('generateSlots', () => {
  it('offers only the owner’s days and hours, in the owner’s time zone', () => {
    const days = generateSlots(rules, now, [])
    expect(days.map((day) => day.date)).toEqual(['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-26'])
    expect(days[1].slots).toEqual([at('2026-11-20', '09:00'), at('2026-11-20', '10:00')])
  })

  it('leaves out slots that have already started today', () => {
    const today = generateSlots(rules, now, [])[0]
    expect(today.slots).toEqual([at('2026-11-19', '10:00'), at('2026-11-19', '11:00')])
  })

  it('keeps the notice period: nothing sooner than 12 hours ahead', () => {
    const days = generateSlots({ ...rules, minNoticeHours: 12 }, now, [])
    expect(days[0].date).toBe('2026-11-20')
    expect(days[0].slots[0]).toBe(at('2026-11-20', '09:00'))
  })

  it('removes only the slot that overlaps something booked or on the agenda', () => {
    const busy = [{ start: new Date(at('2026-11-20', '09:30')), end: new Date(at('2026-11-20', '10:00')) }]
    const friday = generateSlots(rules, now, busy).find((day) => day.date === '2026-11-20')
    // The 09:30 meeting blocks the 09:00 slot (which runs to 10:00) and nothing else.
    expect(friday?.slots).toEqual([at('2026-11-20', '10:00')])
    const wide = generateSlots({ ...rules, hours: { fri: { start: '09:00', end: '13:00' } } }, now, busy).find((day) => day.date === '2026-11-20')
    expect(wide?.slots).toEqual([at('2026-11-20', '10:00'), at('2026-11-20', '11:00'), at('2026-11-20', '12:00')])
  })

  it('drops a day with nothing left, and never offers a window shorter than a slot', () => {
    const full = [{ start: new Date(at('2026-11-23', '08:00')), end: new Date(at('2026-11-23', '12:00')) }]
    expect(generateSlots(rules, now, full).map((day) => day.date)).not.toContain('2026-11-23')
    expect(generateSlots({ ...rules, slotMinutes: 90, hours: { fri: { start: '09:00', end: '10:00' } } }, now, [])).toEqual([])
  })

  it('stops at the number of days ahead', () => {
    expect(generateSlots({ ...rules, daysAhead: 1 }, now, []).map((day) => day.date)).toEqual(['2026-11-19', '2026-11-20'])
  })
})
