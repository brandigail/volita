import { describe, expect, it } from 'vitest'
import { ageOn, isAdult, parseBirthDate } from './age'

const now = new Date(Date.UTC(2026, 10, 16))

describe('age check', () => {
  it('counts whole years, turning a year older on the birthday itself', () => {
    expect(ageOn({ year: 2008, month: 11, day: 16 }, now)).toBe(18)
    expect(ageOn({ year: 2008, month: 11, day: 17 }, now)).toBe(17)
  })
  it('lets in adults and keeps out anyone under 18', () => {
    expect(isAdult('2008-11-16', now)).toBe(true)
    expect(isAdult('2008-11-17', now)).toBe(false)
    expect(isAdult('1961-04-02', now)).toBe(true)
  })
  it('refuses dates that are not real, in the future, or missing', () => {
    expect(parseBirthDate('2001-02-30', now)).toBeNull()
    expect(parseBirthDate('2030-01-01', now)).toBeNull()
    expect(parseBirthDate('1899-12-31', now)).toBeNull()
    expect(parseBirthDate('16/11/2000', now)).toBeNull()
    expect(isAdult(undefined, now)).toBe(false)
    expect(isAdult(null, now)).toBe(false)
  })
})
