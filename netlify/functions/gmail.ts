import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { GMAIL_RETURN_PARAM, type GmailStatus, type PendingEmail } from '../../src/types/gmail.ts'
import { planLimits } from '../../src/types/plans.ts'
import { forgetAccessToken, readMail, sendMail } from './_lib/gmail-api.ts'
import { cancelPending, claimPending, deleteConnection, deleteSent, getConnection, getPending, listLog, logGmail, releasePending, saveConnection, type PendingFull } from './_lib/gmail-store.ts'
import { buildAuthUrl, createState, exchangeCode, fetchGoogleEmail, googleConfigured, hasRequiredScopes, readState, revokeToken } from './_lib/google-oauth.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { requireUser, type SessionUser } from './_lib/session.ts'
import { describeError } from './_lib/safe-log.ts'

const idBody = z.object({ id: z.uuid() })

/** Back to the app with a short code in the address, which the app turns into a message and then removes. */
function backToApp(requestUrl: string, code: string): Response {
  const target = new URL('/', requestUrl)
  target.searchParams.set(GMAIL_RETURN_PARAM, code)
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } })
}

/** Requests that change something must come from the app itself: JSON, and an Origin (when sent) that is this site. */
function fromThisSite(req: Request): boolean {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return false
  const origin = req.headers.get('origin')
  return origin === null || origin === new URL(req.url).origin
}

function toPublic(pending: PendingFull): PendingEmail {
  return { id: pending.id, to: pending.to, subject: pending.subject, body: pending.body, differs: pending.differs, replyToSubject: null, expiresAt: pending.expiresAt }
}

async function status(user: SessionUser): Promise<Response> {
  const connection = await getConnection(user.id)
  return json<GmailStatus>({
    configured: googleConfigured(),
    allowed: planLimits(user.plan).email,
    connected: connection !== null,
    email: connection?.email ?? null,
    needsReconnect: connection?.needsReconnect ?? false,
    connectedAt: connection?.connectedAt ?? null,
  })
}

/** Sends the Google permission screen. Needs a real page navigation, so it answers with a redirect. */
function start(req: Request, user: SessionUser): Response {
  if (!planLimits(user.plan).email) return backToApp(req.url, 'plan')
  if (!googleConfigured()) return backToApp(req.url, 'not_configured')
  return new Response(null, { status: 302, headers: { Location: buildAuthUrl(req.url, createState(user.id), user.email), 'Cache-Control': 'no-store' } })
}

async function callback(req: Request, user: SessionUser): Promise<Response> {
  const params = new URL(req.url).searchParams
  if (params.get('error')) return backToApp(req.url, 'denied')
  const code = params.get('code')
  const stateUser = readState(params.get('state') ?? '')
  // The person who comes back must be the one who started: a copied or old link does nothing.
  if (!code || stateUser !== user.id) return backToApp(req.url, 'failed')
  if (!planLimits(user.plan).email) return backToApp(req.url, 'plan')

  const exchanged = await exchangeCode(code, req.url)
  if (!exchanged.ok) return backToApp(req.url, 'failed')
  const { accessToken, refreshToken, scope } = exchanged.tokens
  if (!hasRequiredScopes(scope)) return backToApp(req.url, 'scopes')
  if (!refreshToken) return backToApp(req.url, 'failed')
  const email = await fetchGoogleEmail(accessToken)
  if (!email) return backToApp(req.url, 'failed')

  await saveConnection(user.id, email, refreshToken)
  forgetAccessToken(user.id)
  await logGmail(user.id, 'connect', email)
  return backToApp(req.url, 'connected')
}

async function disconnect(user: SessionUser): Promise<Response> {
  const connection = await getConnection(user.id)
  if (connection) await revokeToken(connection.refreshToken)
  await deleteConnection(user.id)
  forgetAccessToken(user.id)
  await logGmail(user.id, 'disconnect', connection?.email ?? '')
  return json({ disconnected: true })
}

/** The only place an email is ever sent, and only for an email the person approved: the one they tapped Send on. */
async function send(req: Request, user: SessionUser): Promise<Response> {
  if (!planLimits(user.plan).email) return upgradeResponse('Gmail is part of the Pro plan.', 'pro')
  const body = idBody.safeParse(await req.json().catch(() => null))
  if (!body.success) return errorResponse(400, 'Say which email to send.')
  const quota = await claimQuota(user, 'email')
  if (!quota.ok) return quota.response

  const pending = await claimPending(user.id, body.data.id)
  if (!pending) return errorResponse(409, 'That email is no longer waiting. It may have been sent, cancelled or expired.')

  let inReplyTo: string | undefined
  let references: string | undefined
  if (pending.replyToId) {
    const original = await readMail(user.id, pending.replyToId)
    if (original.ok && original.value.messageIdHeader) {
      inReplyTo = original.value.messageIdHeader
      references = `${original.value.references} ${original.value.messageIdHeader}`.trim().slice(-900)
    }
  }
  const sent = await sendMail(user.id, { to: pending.to, subject: pending.subject, body: pending.body, threadId: pending.threadId, inReplyTo, references })
  if (!sent.ok) {
    await releasePending(user.id, pending.id)
    return errorResponse(sent.reason === 'reconnect' ? 409 : 502, sent.reason === 'reconnect' ? 'Your Gmail connection has expired. Connect Gmail again on the Profile tab, then send.' : 'Gmail did not accept that. Try again in a moment.')
  }
  await deleteSent(user.id, pending.id)
  await logGmail(user.id, 'send', `To ${pending.to}: ${pending.subject}`)
  return json({ sent: true, to: pending.to })
}

async function cancel(req: Request, user: SessionUser): Promise<Response> {
  const body = idBody.safeParse(await req.json().catch(() => null))
  if (!body.success) return errorResponse(400, 'Say which email to cancel.')
  const removed = await cancelPending(user.id, body.data.id)
  if (removed) await logGmail(user.id, 'cancel')
  return json({ cancelled: removed })
}

/** Routes: /api/gmail/start, callback, status, disconnect, pending, send, cancel and log. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) {
    // Coming back from Google without a session (cookie expired): send them to the app to sign in again.
    return new URL(req.url).pathname.endsWith('/callback') ? backToApp(req.url, 'signin') : session.response
  }
  const { user } = session
  const action = new URL(req.url).pathname.split('/').filter(Boolean)[2]

  try {
    if (req.method === 'GET') {
      switch (action) {
        case 'start':
          return start(req, user)
        case 'callback':
          return await callback(req, user)
        case 'status':
          return await status(user)
        case 'pending': {
          const pending = await getPending(user.id)
          return json<{ pending: PendingEmail | null }>({ pending: pending ? toPublic(pending) : null })
        }
        case 'log':
          return json({ entries: await listLog(user.id) })
      }
    }
    if (req.method === 'POST') {
      if (!fromThisSite(req)) return errorResponse(400, 'That request did not come from the app.')
      switch (action) {
        case 'disconnect':
          return await disconnect(user)
        case 'send':
          return await send(req, user)
        case 'cancel':
          return await cancel(req, user)
      }
    }
    return errorResponse(404, 'Not found.')
  } catch (err) {
    console.error('Gmail request failed:', describeError(err))
    return errorResponse(500, 'Something went wrong with Gmail. Please try again.')
  }
}

export const config: Config = { path: '/api/gmail/*' }
