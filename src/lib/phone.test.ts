import { describe, expect, it } from 'vitest'
import { toInternationalNumber } from './phone'

describe('toInternationalNumber', () => {
  it('gives a local number the South African code', () => {
    expect(toInternationalNumber('082 123 4567')).toBe('+27821234567')
    expect(toInternationalNumber('(011) 555-1234')).toBe('+27115551234')
  })
  it('keeps numbers already written internationally', () => {
    expect(toInternationalNumber('+27 82 123 4567')).toBe('+27821234567')
    expect(toInternationalNumber('0027821234567')).toBe('+27821234567')
    expect(toInternationalNumber('+44 7700 900123')).toBe('+447700900123')
    expect(toInternationalNumber('27821234567')).toBe('+27821234567')
  })
  it('leaves anything that is not a usable number as typed', () => {
    expect(toInternationalNumber('Mrs Naidoo')).toBe('Mrs Naidoo')
    expect(toInternationalNumber('12345')).toBe('12345')
    expect(toInternationalNumber('')).toBe('')
  })
})
