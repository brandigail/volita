import { buildRawMessage, extractBody, headerValue, parseAddress, type GmailPayload } from './gmail-mime.ts'
import { getConnection, markNeedsReconnect } from './gmail-store.ts'
import { googleUrls, refreshAccessToken } from './google-oauth.ts'
import { describeError, describeUpstream } from './safe-log.ts'
import { SNIPPET_CHARS, type MailMessage, type MailResult, type MailSummary } from './mail-types.ts'

/** Talks to Gmail for one person. It never throws: every outcome is a result the caller can turn into a kind message. */

const TIMEOUT_MS = 6_000
/** Gmail's message ids: 16 hex characters. */
export const GMAIL_MESSAGE_ID = /^[0-9a-f]{8,24}$/i
const MESSAGE_ID = GMAIL_MESSAGE_ID
const MAX_QUERY_CHARS = 200

type GmailResult<T> = MailResult<T>

// Access tokens last about an hour. They are kept in memory for the life of this server instance only, never stored.
const tokens = new Map<string, { token: string; expiresAt: number }>()

export function forgetAccessToken(userId: string): void {
  tokens.delete(userId)
}

async function accessToken(userId: string): Promise<GmailResult<string>> {
  const cached = tokens.get(userId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return { ok: true, value: cached.token }
  const connection = await getConnection(userId)
  if (!connection) return { ok: false, reason: 'not_connected' }
  if (connection.needsReconnect) return { ok: false, reason: 'reconnect' }
  const refreshed = await refreshAccessToken(connection.refreshToken)
  if (!refreshed.ok) {
    if (refreshed.reason === 'rejected') {
      await markNeedsReconnect(userId)
      return { ok: false, reason: 'reconnect' }
    }
    return { ok: false, reason: 'failed' }
  }
  tokens.set(userId, { token: refreshed.tokens.accessToken, expiresAt: Date.now() + refreshed.tokens.expiresInSeconds * 1000 })
  return { ok: true, value: refreshed.tokens.accessToken }
}

async function call<T>(userId: string, path: string, init: RequestInit = {}): Promise<GmailResult<T>> {
  const token = await accessToken(userId)
  if (!token.ok) return token
  try {
    const response = await fetch(`${googleUrls.gmail()}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token.value}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 401) {
      forgetAccessToken(userId)
      await markNeedsReconnect(userId)
      return { ok: false, reason: 'reconnect' }
    }
    if (response.status === 404) return { ok: false, reason: 'not_found' }
    if (!response.ok) {
      console.error('Gmail refused a request:', await describeUpstream(response))
      return { ok: false, reason: 'failed' }
    }
    return { ok: true, value: (await response.json()) as T }
  } catch (err) {
    console.error('Gmail request failed:', describeError(err))
    return { ok: false, reason: 'failed' }
  }
}

interface ListResponse {
  messages?: { id: string }[]
}

interface MessageResponse {
  id: string
  threadId: string
  snippet?: string
  payload?: GmailPayload
}

function summarise(message: MessageResponse): MailSummary {
  const headers = message.payload?.headers
  const from = parseAddress(headerValue(headers, 'From'))
  return {
    id: message.id,
    from: from ? (from.name ? `${from.name} <${from.email}>` : from.email) : headerValue(headers, 'From').slice(0, 120),
    subject: headerValue(headers, 'Subject').slice(0, 160),
    date: headerValue(headers, 'Date').slice(0, 40),
    snippet: (message.snippet ?? '').slice(0, SNIPPET_CHARS),
  }
}

/** The newest emails matching a Gmail search phrase (the same words as Gmail's own search box). */
export async function searchMail(userId: string, query: string, max: number): Promise<GmailResult<MailSummary[]>> {
  const q = query.trim().slice(0, MAX_QUERY_CHARS)
  const listed = await call<ListResponse>(userId, `/messages?${new URLSearchParams({ q, maxResults: String(Math.min(Math.max(max, 1), 5)) })}`)
  if (!listed.ok) return listed
  const ids = (listed.value.messages ?? []).map((m) => m.id).filter((id) => MESSAGE_ID.test(id))
  const details = await Promise.all(
    ids.map((id) => call<MessageResponse>(userId, `/messages/${id}?${new URLSearchParams([['format', 'metadata'], ['metadataHeaders', 'From'], ['metadataHeaders', 'Subject'], ['metadataHeaders', 'Date']])}`)),
  )
  const failed = details.find((d) => !d.ok)
  if (failed && !failed.ok && failed.reason !== 'not_found') return failed
  return { ok: true, value: details.flatMap((d) => (d.ok ? [summarise(d.value)] : [])) }
}

/** One email in full. Only its text is returned; attachments are never downloaded. */
export async function readMail(userId: string, id: string): Promise<GmailResult<MailMessage>> {
  if (!MESSAGE_ID.test(id)) return { ok: false, reason: 'not_found' }
  const found = await call<MessageResponse>(userId, `/messages/${id}?format=full`)
  if (!found.ok) return found
  const headers = found.value.payload?.headers
  const replyTo = parseAddress(headerValue(headers, 'Reply-To')) ?? parseAddress(headerValue(headers, 'From'))
  return {
    ok: true,
    value: {
      ...summarise(found.value),
      threadId: found.value.threadId,
      replyTo: replyTo?.email ?? null,
      messageIdHeader: headerValue(headers, 'Message-ID') || headerValue(headers, 'Message-Id'),
      references: headerValue(headers, 'References'),
      body: found.value.payload ? extractBody(found.value.payload) : '',
    },
  }
}

export interface SendInput {
  to: string
  subject: string
  body: string
  threadId: string | null
  /** When answering an email: its Message-ID and References headers, so it joins the same conversation. */
  inReplyTo?: string
  references?: string
}

/** Sends an email as the connected person. Only called after the person approved that exact email. */
export async function sendMail(userId: string, input: SendInput): Promise<GmailResult<{ id: string }>> {
  const connection = await getConnection(userId)
  if (!connection) return { ok: false, reason: 'not_connected' }
  let raw: string
  try {
    raw = buildRawMessage({ from: connection.email, to: input.to, subject: input.subject, body: input.body, inReplyTo: input.inReplyTo, references: input.references })
  } catch {
    return { ok: false, reason: 'failed' }
  }
  return call<{ id: string }>(userId, '/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) }) })
}
