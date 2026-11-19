import { describe, expect, it } from 'vitest'
import { publicPageFor } from './route'

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
