import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localDate, takeDailyWelcome } from './welcome'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  })
})
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('daily welcome', () => {
  it('writes the date on the person\'s own clock', () => {
    expect(localDate(new Date(2026, 10, 9, 23, 59))).toBe('2026-11-09')
  })

  it('welcomes once a day, and again the next day', () => {
    expect(takeDailyWelcome(new Date(2026, 10, 19, 8))).toBe(true)
    expect(takeDailyWelcome(new Date(2026, 10, 19, 15))).toBe(false)
    expect(takeDailyWelcome(new Date(2026, 10, 20, 7))).toBe(true)
  })

  it('does not welcome every time when storage is blocked', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => undefined,
      },
    })
    expect(takeDailyWelcome(new Date(2026, 10, 19, 8))).toBe(false)
  })
})
