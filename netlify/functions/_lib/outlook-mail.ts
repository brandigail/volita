import { parseAddress, htmlToText, MAX_BODY_CHARS } from './gmail-mime.ts'
import { parseMailQuery, type MailQuery } from './mail-query.ts'
import { getAccount, handleFor, markAccountNeedsReconnect, refFor, updateSecret } from './mail-store.ts'
import { MAX_RESULTS, SNIPPET_CHARS, type MailMessage, type MailResult, type MailSummary, type SendRequest } from './mail-types.ts'
import { microsoftUrls, refreshMicrosoftToken } from './microsoft-oauth.ts'
import { describeError, describeUpstream } from './safe-log.ts'

/** Outlook.com and Hotmail through Microsoft Graph, for one person. Never throws: every outcome is a result. */

const TIMEOUT_MS = 6_000
const HANDLE = /^o[0-9a-f]{12}$/
const tokens = new Map<string, { token: string; expiresAt: number }>()

export function forgetOutlookToken(userId: string): void {
  tokens.delete(userId)
}

async function accessToken(userId: string): Promise<MailResult<string>> {
  const cached = tokens.get(userId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return { ok: true, value: cached.token }
  const account = await getAccount(userId)
  if (!account || account.provider !== 'outlook') return { ok: false, reason: 'not_connected' }
  if (account.needsReconnect) return { ok: false, reason: 'reconnect' }
  const refreshed = await refreshMicrosoftToken(account.secret)
  if (!refreshed.ok) {
    if (refreshed.reason === 'rejected') await markAccountNeedsReconnect(userId)
    return { ok: false, reason: refreshed.reason === 'rejected' ? 'reconnect' : 'failed' }
  }
  if (refreshed.tokens.refreshToken && refreshed.tokens.refreshToken !== account.secret) await updateSecret(userId, refreshed.tokens.refreshToken)
  tokens.set(userId, { token: refreshed.tokens.accessToken, expiresAt: Date.now() + refreshed.tokens.expiresInSeconds * 1000 })
  return { ok: true, value: refreshed.tokens.accessToken }
}

async function graph<T>(userId: string, path: string, init: RequestInit = {}): Promise<MailResult<T | null>> {
  const token = await accessToken(userId)
  if (!token.ok) return token
  try {
    const response = await fetch(`${microsoftUrls.graph()}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token.value}`, Prefer: 'outlook.body-content-type="text"', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 401) {
      forgetOutlookToken(userId)
      await markAccountNeedsReconnect(userId)
      return { ok: false, reason: 'reconnect' }
    }
    if (response.status === 404) return { ok: false, reason: 'not_found' }
    if (!response.ok) {
      console.error('Microsoft Graph refused a request:', await describeUpstream(response))
      return { ok: false, reason: 'failed' }
    }
    // Sending answers 202 with no body.
    return { ok: true, value: response.status === 202 || response.status === 204 ? null : ((await response.json()) as T) }
  } catch (err) {
    console.error('Microsoft Graph request failed:', describeError(err))
    return { ok: false, reason: 'failed' }
  }
}

interface GraphAddress {
  emailAddress?: { name?: string; address?: string }
}

interface GraphMessage {
  id: string
  conversationId?: string
  subject?: string
  from?: GraphAddress
  replyTo?: GraphAddress[]
  receivedDateTime?: string
  bodyPreview?: string
  body?: { contentType?: string; content?: string }
  internetMessageId?: string
}

const describe = (address: GraphAddress | undefined): string => {
  const { name, address: email } = address?.emailAddress ?? {}
  return email ? (name && name !== email ? `${name} <${email}>` : email) : (name ?? '')
}

const SELECT = 'id,subject,from,receivedDateTime,bodyPreview'
const day = (date: Date) => date.toISOString().slice(0, 10)

/** Each word as a search term with an optional field, keeping only characters that cannot change the search's meaning. */
const kqlTerms = (field: string, values: string[]) =>
  values.flatMap((value) =>
    value
      .replace(/[^\p{L}\p{N}@._-]+/gu, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => `${field}${word}`),
  )

/** Graph's search language (KQL) for words, people and subjects; a plain date filter when there is nothing to search for. */
function listPath(query: MailQuery, max: number): string {
  const folder = query.folder === 'sent' ? 'sentitems' : 'inbox'
  const top = String(Math.min(Math.max(max, 1), MAX_RESULTS))
  const kql = [...kqlTerms('from:', query.from), ...kqlTerms('to:', query.to), ...kqlTerms('subject:', query.subject), ...kqlTerms('', query.words)]
  if (kql.length > 0) {
    if (query.since) kql.push(`received>=${day(query.since)}`)
    if (query.before) kql.push(`received<${day(query.before)}`)
    return `/mailFolders/${folder}/messages?${new URLSearchParams({ $search: `"${kql.join(' AND ')}"`, $top: top, $select: SELECT })}`
  }
  const since = query.since ?? new Date(Date.now() - 30 * 86_400_000)
  const filter = [`receivedDateTime ge ${since.toISOString()}`, ...(query.before ? [`receivedDateTime lt ${query.before.toISOString()}`] : []), ...(query.unread === null ? [] : [`isRead eq ${!query.unread}`])]
  return `/mailFolders/${folder}/messages?${new URLSearchParams({ $filter: filter.join(' and '), $orderby: 'receivedDateTime desc', $top: top, $select: SELECT })}`
}

async function summarise(userId: string, message: GraphMessage): Promise<MailSummary> {
  return {
    id: await handleFor(userId, message.id),
    from: describe(message.from).slice(0, 120),
    subject: (message.subject ?? '').slice(0, 160),
    date: (message.receivedDateTime ?? '').slice(0, 40),
    snippet: (message.bodyPreview ?? '').slice(0, SNIPPET_CHARS),
  }
}

export async function searchOutlook(userId: string, query: string, max: number): Promise<MailResult<MailSummary[]>> {
  const listed = await graph<{ value?: GraphMessage[] }>(userId, listPath(parseMailQuery(query), max))
  if (!listed.ok) return listed
  const messages = (listed.value?.value ?? []).slice(0, MAX_RESULTS)
  return { ok: true, value: await Promise.all(messages.map((message) => summarise(userId, message))) }
}

export async function readOutlook(userId: string, handle: string): Promise<MailResult<MailMessage>> {
  if (!HANDLE.test(handle)) return { ok: false, reason: 'not_found' }
  const ref = await refFor(userId, handle)
  if (!ref) return { ok: false, reason: 'not_found' }
  const found = await graph<GraphMessage>(userId, `/messages/${encodeURIComponent(ref)}?$select=${SELECT},body,replyTo,conversationId,internetMessageId`)
  if (!found.ok) return found
  const message = found.value
  if (!message) return { ok: false, reason: 'failed' }
  const replyTo = parseAddress(describe(message.replyTo?.[0])) ?? parseAddress(describe(message.from))
  const content = message.body?.content ?? ''
  const text = message.body?.contentType?.toLowerCase() === 'html' ? htmlToText(content) : content
  return {
    ok: true,
    value: {
      ...(await summarise(userId, message)),
      threadId: message.conversationId ?? '',
      replyTo: replyTo?.email ?? null,
      messageIdHeader: message.internetMessageId ?? '',
      references: '',
      body: text.trim().slice(0, MAX_BODY_CHARS),
    },
  }
}

const recipient = (to: string) => [{ emailAddress: { address: to } }]

/** Sends an approved email. A reply goes through Outlook's own reply, so it joins the conversation. */
export async function sendOutlook(userId: string, email: SendRequest): Promise<MailResult<null>> {
  const ref = email.replyToId ? await refFor(userId, email.replyToId) : null
  if (ref) {
    return graph<null>(userId, `/messages/${encodeURIComponent(ref)}/reply`, { method: 'POST', body: JSON.stringify({ message: { toRecipients: recipient(email.to) }, comment: email.body }) })
  }
  return graph<null>(userId, '/sendMail', {
    method: 'POST',
    body: JSON.stringify({ message: { subject: email.subject, body: { contentType: 'Text', content: email.body }, toRecipients: recipient(email.to) }, saveToSentItems: true }),
  })
}
