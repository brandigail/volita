import { describe, expect, it } from 'vitest'
import { callName, greetingFor, partOfDay, spokenWelcome } from './greeting'

const at = (hour: number) => new Date(2026, 10, 19, hour, 30)

describe('greeting', () => {
  it('uses the nickname when there is one, and the first name when there is not', () => {
    expect(callName({ nickname: 'Mayoman', name: 'Martin Myers' })).toBe('Mayoman')
    expect(callName({ nickname: '  ', name: 'Martin Myers' })).toBe('Martin')
    expect(callName({ nickname: '', name: '' })).toBe('')
  })

  it('says good morning, afternoon or evening by the hour', () => {
    expect(partOfDay(5)).toBe('morning')
    expect(partOfDay(12)).toBe('afternoon')
    expect(partOfDay(17)).toBe('afternoon')
    expect(partOfDay(18)).toBe('evening')
    expect(greetingFor({ nickname: 'Mayoman', name: 'Martin' }, at(8))).toBe('Good morning, Mayoman.')
    expect(greetingFor({ nickname: '', name: 'Martin Myers' }, at(20))).toBe('Good evening, Martin.')
    expect(greetingFor({ nickname: '', name: '' }, at(14))).toBe('Good afternoon.')
  })

  it('welcomes the person back by name, within one spoken request', () => {
    expect(spokenWelcome({ nickname: 'Mayoman', name: 'Martin' })).toBe('Welcome back, Mayoman. What can I do for you?')
    expect(spokenWelcome({ nickname: 'The Sauce Boss of the Whole Western Cape', name: 'Martin' }).length).toBeLessThan(200)
  })
})
