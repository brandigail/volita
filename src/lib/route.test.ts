import { describe, expect, it } from 'vitest'
import { bookingSlugFor, publicPageFor } from './route'

describe('publicPageFor', () => {
  it('finds the four public pages, ignoring case and a trailing slash', () => {
    expect(publicPageFor('/privacy')).toBe('privacy')
    expect(publicPageFor('/Terms/')).toBe('terms')
    expect(publicPageFor('/support')).toBe('support')
    expect(publicPageFor('/check/')).toBe('check')
  })

  it('leaves the home address and unknown addresses to the app', () => {
    for (const path of ['/', '', '/api/plan', '/privacy/extra', '/profile', '/privacy.html']) expect(publicPageFor(path)).toBeNull()
  })
})

describe('bookingSlugFor', () => {
  it('reads the address from a booking link, ignoring case and a trailing slash', () => {
    expect(bookingSlugFor('/book/dube-plumbing-1a2b')).toBe('dube-plumbing-1a2b')
    expect(bookingSlugFor('/book/Dube-Plumbing/')).toBe('dube-plumbing')
  })

  it('leaves every other address alone', () => {
    for (const path of ['/book', '/book/', '/book/ab', '/book/-bad', '/book/a/b', '/booking/abc', '/']) expect(bookingSlugFor(path)).toBeNull()
  })
})
