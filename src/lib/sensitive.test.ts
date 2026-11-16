import { describe, expect, it } from 'vitest'
import { findSensitive, sensitiveMessage } from './sensitive'

describe('findSensitive catches', () => {
  it.each([
    ['Charge it to card 4111 1111 1111 1111 please', 'card'],
    ['her card number is 5500-0000-0000-0004 expiry 12/28', 'card'],
    ['use 4012888888881881 for the deposit', 'card'],
    ['the amex is 3782 822463 10005', 'card'],
    ['The card number is 4111,000.', 'card'],
    ['Please charge the deposit to $4,539,148,803,436,467.', 'card'],
    // A real Whisper transcript: one digit misheard, so the checksum fails, but it is still a card number.
    ['Message for Thabo. Please charge the deposit to 4539148834346467, expiry 1228.', 'card'],
    ['my credit card number: 5500 00', 'card'],
    ['Pay into account number 62123456789 at FNB', 'bank'],
    ['his acc no: 1234 5678 90', 'bank'],
    ['Bank account 4071 2345 67, branch code 250655', 'bank'],
    ['the branch code is 632005', 'bank'],
    ['Swift code FIRNZAJJ', 'bank'],
    ['IBAN GB82 WEST 1234 5698 7654 32', 'bank'],
    ['tell him the password is Sunshine2024', 'password'],
    ['My Gmail password: hunter22', 'password'],
    ['the PIN is 4821', 'password'],
    ['her OTP is 993112', 'password'],
    ['CVV is 123', 'password'],
    ['the one-time pin was 55120', 'password'],
  ])('%s', (text, kind) => {
    expect(findSensitive(text)).toContain(kind)
  })
})

describe('findSensitive leaves ordinary work alone', () => {
  it.each([
    'Quote for Mrs. Jones, 12 Oak Street. New 150 litre geyser, 4,800. Pressure valve, 350. Two hours labour at 450. Add VAT.',
    'Call me on 082 123 4567 or +27 82 123 4567',
    'The deck will cost R12 500 and I can start on the 5th of December 2026.',
    'Invoice 2026-11-16, order number 1234567890123',
    'Her password is wrong, can you reset it for her?',
    'The PIN is in the drawer next to the kettle',
    'Remind me to change my password tomorrow',
    'The swift delivery was great, thanks',
    'Meet at 14:30 on 16/11/2026, unit 4 block 7',
    'Sort the account out by Friday, it is 3 months late',
    'Add 2 hours to his account at 450 an hour',
    'Tracking number 1Z999AA10123456784',
    'Invoice 2026111600042 is attached',
    'reference INV 4411 2233',
    'Pay by card when the job is done, about 4 500 rand',
    'The card reader costs 1 200',
    'Prices: 4,800, 350, 450, 1,200 and 2,500 for the lot',
    'Invoice totals 12,500.00, 3,400.50 and 980.00',
    'Office line 011 234 5678, cell 082 123 4567',
  ])('%s', (text) => {
    expect(findSensitive(text)).toEqual([])
  })
})

it('names what was found in the warning', () => {
  expect(sensitiveMessage(['card', 'password'])).toContain('a card number and a password, PIN or security code')
})
