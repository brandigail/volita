import { describe, expect, it } from 'vitest'
import { callName, greetingChoices, partOfDay, pickGreeting, spokenWelcome } from './greeting'

const at = (hour: number, day = 3) => new Date(2026, 10, 15 + day, hour, 30) // 18 Nov 2026 is a Wednesday when day is 3

describe('greeting', () => {
  it('uses the nickname when there is one, and the first name when there is not', () => {
    expect(callName({ nickname: 'Mayoman', name: 'Martin Myers' })).toBe('Mayoman')
    expect(callName({ nickname: '  ', name: 'Martin Myers' })).toBe('Martin')
    expect(callName({ nickname: '', name: '' })).toBe('')
  })

  it('knows the part of the day', () => {
    expect(partOfDay(5)).toBe('morning')
    expect(partOfDay(12)).toBe('afternoon')
    expect(partOfDay(18)).toBe('evening')
    expect(partOfDay(23)).toBe('night')
    expect(partOfDay(2)).toBe('night')
  })

  it('offers plenty of choices, all using the name, and fits the time of day', () => {
    const morning = greetingChoices('Mayoman', at(8))
    expect(morning.length).toBeGreaterThan(10)
    expect(morning.every((line) => line.includes('Mayoman'))).toBe(true)
    expect(morning).toContain('Good morning, Mayoman.')
    expect(morning).not.toContain('Good evening, Mayoman.')
    expect(greetingChoices('Mayoman', at(20))).toContain('Good evening, Mayoman.')
  })

  it('adds a line for the day of the week', () => {
    expect(greetingChoices('Mayoman', at(10, 5))).toContain('Happy Friday, Mayoman.') // 20 Nov 2026 is a Friday
    expect(greetingChoices('Mayoman', at(10, 4)).some((line) => line.includes('Happy Friday'))).toBe(false)
  })

  it('never repeats the one shown last', () => {
    const profile = { nickname: 'Mayoman', name: 'Martin' }
    const all = greetingChoices('Mayoman', at(9))
    for (const previous of all) {
      for (const random of [0, 0.5, 0.999]) {
        expect(pickGreeting(profile, at(9), previous, () => random)).not.toBe(previous)
      }
    }
  })

  it('reads well with no name at all', () => {
    const lines = greetingChoices('', at(9))
    expect(lines.some((line) => line.includes('{name}'))).toBe(false)
    expect(lines).toContain('Welcome back.')
    expect(lines).toContain('Hey, what are we sorting today?')
    expect(lines).toContain('Back at it again?')
  })

  it('turns a greeting into a spoken welcome that fits one spoken request', () => {
    const line = spokenWelcome('Welcome back, Mayoman.')
    expect(line).toBe('Welcome back, Mayoman. What can I do for you?')
    expect(spokenWelcome('Burning the midnight oil, The Sauce Boss of the Whole Western Cape?').length).toBeLessThan(200)
  })
})
