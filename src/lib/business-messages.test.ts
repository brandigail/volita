import { describe, expect, it } from 'vitest'
import type { Invoice } from '../types/business'
import type { Profile } from '../types/profile'
import { chaserMessage, reviewMessage } from './business-messages'

const profile: Profile = { name: 'Sam Dube', businessName: 'Dube Plumbing', role: '', phone: '082 000 1111', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }
const invoice: Invoice = {
  id: 'i1',
  number: 'INV-0012',
  contactId: null,
  customerName: 'Mrs Naidoo',
  customerPhone: '',
  customerEmail: '',
  items: [],
  vatRate: 15,
  subtotalCents: 605_000,
  vatCents: 90_750,
  totalCents: 695_750,
  status: 'SENT',
  issuedOn: '2026-10-20',
  dueOn: '2026-10-27',
  paidAt: null,
  remindersSent: 0,
  lastRemindedAt: null,
  note: '',
  createdAt: '2026-10-20T08:00:00.000Z',
}

describe('chaserMessage', () => {
  it('is friendly the first time and offers an out if they have already paid', () => {
    const message = chaserMessage(1, invoice, profile, '2026-11-03')
    expect(message.subject).toBe('Reminder: invoice INV-0012')
    expect(message.body).toContain('Hi Mrs Naidoo,')
    expect(message.body).toContain('R6 957.50')
    expect(message.body).toContain('27 Oct 2026')
    expect(message.body).toContain('already paid')
  })

  it('counts the days late and gives a pay-by date three days ahead in the second one', () => {
    const message = chaserMessage(2, invoice, profile, '2026-11-10')
    expect(message.subject).toBe('Second reminder: invoice INV-0012')
    expect(message.body).toContain('14 days overdue')
    expect(message.body).toContain('13 Nov 2026')
  })

  it('is clear but never threatens in the final one', () => {
    const message = chaserMessage(3, invoice, profile, '2026-11-26')
    expect(message.body).toContain('final reminder')
    expect(message.body).not.toMatch(/lawyer|legal|court|attorney|blacklist|police/i)
  })

  it('ends with the owner sign-off and never carries bank details', () => {
    const message = chaserMessage(1, invoice, { ...profile, signature: 'Cheers, Sam' }, '2026-11-03')
    expect(message.body.endsWith('Cheers, Sam')).toBe(true)
    expect(message.body).toContain('banking details are on the invoice')
    expect(message.body).not.toMatch(/\d{8,}/)
  })
})

describe('reviewMessage', () => {
  it('keeps the review link exactly as saved and signs off', () => {
    const message = reviewMessage('Mrs Naidoo', 'https://g.page/r/abc123/review', profile)
    expect(message.body).toContain('\nhttps://g.page/r/abc123/review\n')
    expect(message.body).toContain('Dube Plumbing')
    expect(message.body.endsWith('082 000 1111')).toBe(true)
  })
})
