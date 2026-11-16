import { describe, expect, it } from 'vitest'
import { referralFromSearch, referralLink } from './referral'

describe('referralFromSearch', () => {
  it('reads and upper-cases a valid code', () => {
    expect(referralFromSearch('?ref=abcd2345')).toBe('ABCD2345')
    expect(referralFromSearch('?utm=x&ref=K7M3P9QX')).toBe('K7M3P9QX')
  })

  it('ignores missing, too short, too long and unsafe codes', () => {
    for (const search of ['', '?ref=', '?ref=ab', '?ref=' + 'A'.repeat(17), '?ref=<script>', '?ref=a b c d', '?other=ABCD2345']) {
      expect(referralFromSearch(search)).toBeNull()
    }
  })
})

describe('referralLink', () => {
  it('puts the code on the site address', () => {
    expect(referralLink('https://volita.netlify.app', 'ABCD2345')).toBe('https://volita.netlify.app/?ref=ABCD2345')
  })
})
