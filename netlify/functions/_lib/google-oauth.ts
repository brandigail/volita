import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { describeError, describeUpstream } from './safe-log.ts'

/**
 * Google sign-in for the Gmail connection. Volita asks for the least it needs: read mail and send mail, plus the
 * address of the account so the person can see which mailbox is connected. No delete, archive or settings access.
 */
export const GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'] as const

const REQUIRED_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']
const STATE_MINUTES = 10
const REQUEST_TIMEOUT_MS = 8_000

/**
 * For automated tests only: when GOOGLE_STUB_URL is set, every Google address below points at that local server, so
 * the whole flow can be tested without a real Google account. It is never set in production.
 */
function stub(): string | null {
  return process.env.GOOGLE_STUB_URL ?? null
}

export const googleUrls = {
  auth: () => (stub() ? `${stub()}/auth` : 'https://accounts.google.com/o/oauth2/v2/auth'),
  token: () => (stub() ? `${stub()}/token` : 'https://oauth2.googleapis.com/token'),
  revoke: () => (stub() ? `${stub()}/revoke` : 'https://oauth2.googleapis.com/revoke'),
  userInfo: () => (stub() ? `${stub()}/userinfo` : 'https://openidconnect.googleapis.com/v1/userinfo'),
  gmail: () => (stub() ? `${stub()}/gmail/v1/users/me` : 'https://gmail.googleapis.com/gmail/v1/users/me'),
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/** Where Google sends the person back to. Must match an address registered in the Google Cloud console exactly. */
export function redirectUri(requestUrl: string): string {
  return process.env.GOOGLE_REDIRECT_URI ?? `${new URL(requestUrl).origin}/api/gmail/callback`
}

function stateSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set')
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', stateSecret()).update(`gmail-state|${payload}`).digest('base64url')
}

/**
 * A signed, short-lived value that travels to Google and back. It proves the person who comes back is the one who
 * started the connection, so someone cannot be tricked into connecting an attacker's mailbox to their account.
 */
export function createState(userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: now + STATE_MINUTES * 60_000, n: randomBytes(9).toString('base64url') })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** The user id inside a state value, or null if it was tampered with, is malformed or has expired. */
export function readState(state: string, now = Date.now()): string | null {
  const [payload, signature, ...extra] = state.split('.')
  if (!payload || !signature || extra.length > 0) return null
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; e?: unknown }
    return typeof data.u === 'string' && typeof data.e === 'number' && data.e > now ? data.u : null
  } catch {
    return null
  }
}

export function buildAuthUrl(requestUrl: string, state: string, loginHint?: string): string {
  const url = new URL(googleUrls.auth())
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '')
  url.searchParams.set('redirect_uri', redirectUri(requestUrl))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GMAIL_SCOPES.join(' '))
  // "offline" plus "consent" is what makes Google hand back a refresh token every time.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'false')
  url.searchParams.set('state', state)
  if (loginHint) url.searchParams.set('login_hint', loginHint)
  return url.toString()
}

/** True only when the person left both the read and the send permission ticked on Google's screen. */
export function hasRequiredScopes(granted: string): boolean {
  const have = new Set(granted.split(/\s+/))
  return REQUIRED_SCOPES.every((scope) => have.has(scope))
}

export interface TokenSet {
  accessToken: string
  expiresInSeconds: number
  refreshToken: string | null
  scope: string
}

type TokenResult = { ok: true; tokens: TokenSet } | { ok: false; reason: 'rejected' | 'failed' }

async function tokenRequest(params: Record<string, string>): Promise<TokenResult> {
  try {
    const response = await fetch(googleUrls.token(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', ...params }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error('Google token request refused:', await describeUpstream(response))
      // 400 invalid_grant means the permission was revoked or has expired; anything else is a passing problem.
      return { ok: false, reason: response.status === 400 || response.status === 401 ? 'rejected' : 'failed' }
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string }
    if (!body.access_token) return { ok: false, reason: 'failed' }
    return { ok: true, tokens: { accessToken: body.access_token, expiresInSeconds: body.expires_in ?? 3000, refreshToken: body.refresh_token ?? null, scope: body.scope ?? '' } }
  } catch (err) {
    console.error('Google token request failed:', describeError(err))
    return { ok: false, reason: 'failed' }
  }
}

export function exchangeCode(code: string, requestUrl: string): Promise<TokenResult> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(requestUrl) })
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
}

/** The Gmail address behind an access token, or null if Google did not say. */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(googleUrls.userInfo(), { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!response.ok) return null
    const body = (await response.json()) as { email?: string }
    return typeof body.email === 'string' ? body.email : null
  } catch (err) {
    console.error('Google user lookup failed:', describeError(err))
    return null
  }
}

/** Tells Google to forget the permission, so "disconnect" really ends it rather than only deleting our copy. Best effort. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(googleUrls.revoke(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('Google revoke failed:', describeError(err))
  }
}
