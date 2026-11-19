import { describe, expect, it } from 'vitest'
import { mentionsCustomer, phoneTail, plain } from './customer-match'

const naidoo = { name: 'Mrs Naidoo', phone: '082 123 4567', email: 'naidoo@example.com' }

describe('mentionsCustomer', () => {
  it('matches the full name as whole words, ignoring case and accents', () => {
    expect(mentionsCustomer('Quote for mrs naidoo', naidoo)).toBe(true)
    expect(mentionsCustomer('Meeting: Mrs Naidoo, geyser', naidoo)).toBe(true)
    expect(mentionsCustomer('José', { name: 'Jose', phone: '', email: '' })).toBe(true)
  })

  it('matches whole words only: not part of a longer word, and not just the surname of a fuller name', () => {
    expect(mentionsCustomer('Sam from the shop', { name: 'Sam', phone: '', email: '' })).toBe(true)
    expect(mentionsCustomer('Samsung fridge', { name: 'Sam', phone: '', email: '' })).toBe(false)
    expect(mentionsCustomer('Naidoo family', naidoo)).toBe(false)
  })

  it('matches the phone number whatever way it is written', () => {
    expect(mentionsCustomer('+27 82 123 4567', naidoo)).toBe(true)
    expect(mentionsCustomer('27821234567', naidoo)).toBe(true)
    expect(mentionsCustomer('Call 082-123-4567 tomorrow', naidoo)).toBe(true)
    expect(mentionsCustomer('Call 082-999-4567', naidoo)).toBe(false)
  })

  it('matches the email address', () => {
    expect(mentionsCustomer('Sent to Naidoo@Example.com', naidoo)).toBe(true)
  })

  it('never matches empty text or a customer with nothing to go on', () => {
    expect(mentionsCustomer('', naidoo)).toBe(false)
    expect(mentionsCustomer('anything', { name: '', phone: '', email: '' })).toBe(false)
  })
})

describe('phoneTail and plain', () => {
  it('uses the last nine digits and ignores short numbers', () => {
    expect(phoneTail('+27 82 123 4567')).toBe('821234567')
    expect(phoneTail('12345')).toBe('')
  })

  it('tidies names', () => {
    expect(plain('  José   Naidoo ')).toBe('jose naidoo')
  })
})
