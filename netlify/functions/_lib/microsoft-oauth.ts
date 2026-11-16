import { describeError, describeUpstream } from './safe-log.ts'

/**
 * Microsoft sign-in for Outlook.com and Hotmail (and work Microsoft 365 mailboxes). Outlook no longer accepts app
 * passwords, so this is the only way in. Volita asks for the least it needs: read mail and send mail, plus the address.
 */
export const OUTLOOK_SCOPES = ['openid', 'email', 'offline_access', 'Mail.Read', 'Mail.Send'] as const
const REQUIRED = ['mail.read', 'mail.send']
const TIMEOUT_MS = 8_000

/** For automated tests only: points every Microsoft address at a local stub server. Never set in production. */
const stub = (): string | null => process.env.MICROSOFT_STUB_URL ?? null

export const microsoftUrls = {
  auth: () => (stub() ? `${stub()}/authorize` : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'),
  token: () => (stub() ? `${stub()}/token` : 'https://login.microsoftonline.com/common/oauth2/v2.0/token'),
  graph: () => (stub() ? `${stub()}/graph/v1.0/me` : 'https://graph.microsoft.com/v1.0/me'),
}

export function microsoftConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
}

/** Must match a redirect address registered for the app in the Microsoft Entra admin centre exactly. */
export function microsoftRedirectUri(requestUrl: string): string {
  return process.env.MICROSOFT_REDIRECT_URI ?? `${new URL(requestUrl).origin}/api/mail/outlook/callback`
}

export function buildMicrosoftAuthUrl(requestUrl: string, state: string, loginHint?: string): string {
  const url = new URL(microsoftUrls.auth())
  url.searchParams.set('client_id', process.env.MICROSOFT_CLIENT_ID ?? '')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', microsoftRedirectUri(requestUrl))
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', OUTLOOK_SCOPES.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  if (loginHint) url.searchParams.set('login_hint', loginHint)
  return url.toString()
}

/** True only when the person allowed both reading and sending. Microsoft may list scopes with the Graph prefix. */
export function hasOutlookScopes(granted: string): boolean {
  const have = new Set(granted.split(/\s+/).map((scope) => scope.replace(/^https:\/\/graph\.microsoft\.com\//i, '').toLowerCase()))
  return REQUIRED.every((scope) => have.has(scope))
}

export interface MicrosoftTokens {
  accessToken: string
  expiresInSeconds: number
  refreshToken: string | null
  scope: string
  /** The mailbox address, from the sign-in's id token. */
  email: string | null
}

type TokenResult = { ok: true; tokens: MicrosoftTokens } | { ok: false; reason: 'rejected' | 'failed' }

/** The address inside an id token. It came straight from Microsoft over an encrypted connection, so it is read, not re-verified. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: unknown; preferred_username?: unknown }
    const email = typeof claims.email === 'string' ? claims.email : typeof claims.preferred_username === 'string' ? claims.preferred_username : null
    return email && email.includes('@') ? email.toLowerCase() : null
  } catch {
    return null
  }
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResult> {
  try {
    const response = await fetch(microsoftUrls.token(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID ?? '', client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '', scope: OUTLOOK_SCOPES.join(' '), ...params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error('Microsoft token request refused:', await describeUpstream(response))
      return { ok: false, reason: response.status === 400 || response.status === 401 ? 'rejected' : 'failed' }
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string }
    if (!body.access_token) return { ok: false, reason: 'failed' }
    return {
      ok: true,
      tokens: { accessToken: body.access_token, expiresInSeconds: body.expires_in ?? 3000, refreshToken: body.refresh_token ?? null, scope: body.scope ?? '', email: emailFromIdToken(body.id_token) },
    }
  } catch (err) {
    console.error('Microsoft token request failed:', describeError(err))
    return { ok: false, reason: 'failed' }
  }
}

export function exchangeMicrosoftCode(code: string, requestUrl: string): Promise<TokenResult> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: microsoftRedirectUri(requestUrl) })
}

export function refreshMicrosoftToken(refreshToken: string): Promise<TokenResult> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
}
