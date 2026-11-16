import { describe, expect, it } from 'vitest'
import { ALL_PLANS, planFor, planLimits, yearlyFreeMonthsText } from '../../types/plans'
import { daysLeft } from './trial'

const NOW = Date.parse('2026-11-16T10:00:00Z')
const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString()

describe('daysLeft', () => {
  it('counts a part day as a day, so the last day says 1 and never 0', () => {
    expect(daysLeft(at(14 * 24), NOW)).toBe(14)
    expect(daysLeft(at(13 * 24 + 1), NOW)).toBe(14)
    expect(daysLeft(at(5), NOW)).toBe(1)
    expect(daysLeft(at(0.01), NOW)).toBe(1)
  })

  it('is 0 once the time has passed', () => {
    expect(daysLeft(at(0), NOW)).toBe(0)
    expect(daysLeft(at(-48), NOW)).toBe(0)
  })
})

describe('plans', () => {
  it('words the yearly saving honestly', () => {
    expect(yearlyFreeMonthsText(planFor('basic'))).toBe('2 months free')
    expect(yearlyFreeMonthsText(planFor('pro'))).toBe('about 4 months free')
    expect(yearlyFreeMonthsText(planFor('free'))).toBeNull()
  })

  it('never charges more for a year than twelve months', () => {
    for (const plan of ALL_PLANS) if (plan.usdPerYear > 0) expect(plan.usdPerYear).toBeLessThanOrEqual(plan.usdPerMonth * 12)
  })

  it('has the draft limits Brandon chose, and email only for Pro', () => {
    expect([planLimits('free').draftsPerDay, planLimits('basic').draftsPerDay, planLimits('pro').draftsPerDay]).toEqual([3, 50, 300])
    expect([planLimits('free').email, planLimits('basic').email, planLimits('pro').email]).toEqual([false, false, true])
  })
})
