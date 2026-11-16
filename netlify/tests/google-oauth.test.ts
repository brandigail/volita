import { describe, expect, it } from 'vitest'
import { buildAuthUrl, createState, GMAIL_SCOPES, hasRequiredScopes, readState, redirectUri } from '../functions/_lib/google-oauth.ts'

describe('connection state', () => {
  it('carries the user id through Google and back', () => {
    expect(readState(createState('user-1'))).toBe('user-1')
  })

  it('is different every time', () => {
    expect(createState('user-1')).not.toBe(createState('user-1'))
  })

  it('refuses a changed user id, a changed signature and junk', () => {
    const state = createState('user-1')
    const [payload, signature] = state.split('.')
    const forged = Buffer.from(JSON.stringify({ u: 'user-2', e: Date.now() + 60_000, n: 'x' })).toString('base64url')
    expect(readState(`${forged}.${signature}`)).toBeNull()
    expect(readState(`${payload}.${signature?.slice(0, -2)}AA`)).toBeNull()
    for (const junk of ['', 'abc', 'a.b', 'a.b.c', `${payload}.`, `.${signature}`]) expect(readState(junk)).toBeNull()
  })

  it('expires after ten minutes', () => {
    const state = createState('user-1', 1_000_000)
    expect(readState(state, 1_000_000 + 9 * 60_000)).toBe('user-1')
    expect(readState(state, 1_000_000 + 11 * 60_000)).toBeNull()
  })
})

describe('the Google permission screen address', () => {
  const url = new URL(buildAuthUrl('https://volita.netlify.app/api/gmail/start', 'STATE', 'dad@gmail.com'))

  it('asks for offline access and a fresh consent so a refresh token always comes back', () => {
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('STATE')
    expect(url.searchParams.get('login_hint')).toBe('dad@gmail.com')
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
  })

  it('asks for the least: read mail and send mail, never delete or settings', () => {
    const scopes = (url.searchParams.get('scope') ?? '').split(' ')
    expect(scopes).toEqual([...GMAIL_SCOPES])
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.send')
    expect(scopes.some((s) => /modify|compose|settings|mail\.google\.com|delete/.test(s))).toBe(false)
  })

  it('sends the person back to this site', () => {
    expect(url.searchParams.get('redirect_uri')).toBe('https://volita.netlify.app/api/gmail/callback')
    expect(redirectUri('http://localhost:8888/api/gmail/start')).toBe('http://localhost:8888/api/gmail/callback')
  })
})

describe('hasRequiredScopes', () => {
  it('needs both read and send, because the person can untick one on Google\'s screen', () => {
    const read = 'https://www.googleapis.com/auth/gmail.readonly'
    const send = 'https://www.googleapis.com/auth/gmail.send'
    expect(hasRequiredScopes(`openid email ${read} ${send}`)).toBe(true)
    expect(hasRequiredScopes(`openid email ${read}`)).toBe(false)
    expect(hasRequiredScopes(`${send}`)).toBe(false)
    expect(hasRequiredScopes('')).toBe(false)
  })
})
