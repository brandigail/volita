import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { GMAIL_RETURN_PARAM, type PendingEmail } from '../../src/types/gmail.ts'
import { planLimits } from '../../src/types/plans.ts'
import { forgetAccessToken } from './_lib/gmail-api.ts'
import { sendFromMailbox } from './_lib/mailbox.ts'
import { cancelPending, claimPending, deleteSent, getPending, listLog, logGmail, releasePending, saveConnection, sentToday, type PendingFull } from './_lib/gmail-store.ts'
import { noteSpam } from './_lib/safety.ts'
import { buildAuthUrl, createState, exchangeCode, fetchGoogleEmail, googleConfigured, hasRequiredScopes, readState } from './_lib/google-oauth.ts'
import { resultPage } from './_lib/gmail-pages.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { requireUser, type SessionUser } from './_lib/session.ts'
import { describeError } from './_lib/safe-log.ts'

const idBody = z.object({ id: z.uuid() })
/** Most emails one person can send through Volita in 24 hours. */
const MAX_SENDS_PER_DAY = 40

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


/** Sends the Google permission screen. Needs a real page navigation, so it answers with a redirect. */
function start(req: Request, user: SessionUser): Response {
  if (!planLimits(user.plan).email) return backToApp(req.url, 'plan')
  if (!googleConfigured()) return backToApp(req.url, 'not_configured')
  return new Response(null, { status: 302, headers: { Location: buildAuthUrl(req.url, createState(user.id), user.email), 'Cache-Control': 'no-store' } })
}

/**
 * Where Google sends the person back to. It does not rely on the sign-in cookie, because the browser that returns may not
 * be the one Volita is signed in to. The signed state is the proof: only a signed-in person can have been given one,
 * it names that person, it expires in ten minutes, and Google's code works once.
 */
async function callback(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams
  if (params.get('error')) return resultPage(req.url, 'denied')
  const code = params.get('code')
  const userId = readState(params.get('state') ?? '')
  if (!code || !userId) return resultPage(req.url, 'failed')

  const exchanged = await exchangeCode(code, req.url)
  if (!exchanged.ok) return resultPage(req.url, 'failed')
  const { accessToken, refreshToken, scope } = exchanged.tokens
  if (!hasRequiredScopes(scope)) return resultPage(req.url, 'scopes')
  if (!refreshToken) return resultPage(req.url, 'failed')
  const email = await fetchGoogleEmail(accessToken)
  if (!email) return resultPage(req.url, 'failed')

  await saveConnection(userId, email, refreshToken)
  forgetAccessToken(userId)
  await logGmail(userId, 'connect', email)
  return resultPage(req.url, 'connected')
}


/** The only place an email is ever sent, and only for an email the person approved: the one they tapped Send on. */
async function send(req: Request, user: SessionUser): Promise<Response> {
  if (!planLimits(user.plan).email) return upgradeResponse('Email is part of the Pro plan.', 'pro')
  const body = idBody.safeParse(await req.json().catch(() => null))
  if (!body.success) return errorResponse(400, 'Say which email to send.')
  const quota = await claimQuota(user, 'email')
  if (!quota.ok) return quota.response
  // A tradesperson answers a handful of emails a day; far more than that is someone using Volita to send spam.
  if ((await sentToday(user.id)) >= MAX_SENDS_PER_DAY) {
    await noteSpam(user.id, 'email send')
    return errorResponse(429, `Volita sends at most ${MAX_SENDS_PER_DAY} emails a day for you. Please send the rest from your email app.`)
  }

  const pending = await claimPending(user.id, body.data.id)
  if (!pending) return errorResponse(409, 'That email is no longer waiting. It may have been sent, cancelled or expired.')

  const sent = await sendFromMailbox(user.id, { to: pending.to, subject: pending.subject, body: pending.body, threadId: pending.threadId, replyToId: pending.replyToId })
  if (!sent.ok) {
    await releasePending(user.id, pending.id)
    return errorResponse(
      sent.reason === 'reconnect' || sent.reason === 'not_connected' ? 409 : 502,
      sent.reason === 'reconnect' || sent.reason === 'not_connected' ? 'Your email connection has stopped working. Connect your email again on the Profile tab, then send.' : 'Your email service did not accept that. Try again in a moment.',
    )
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

/** Routes: /api/gmail/start, callback, pending, send, cancel and log. Status and disconnecting are in mail.ts, for every service. */
export default async function handler(req: Request): Promise<Response> {
  const action = new URL(req.url).pathname.split('/').filter(Boolean)[2]
  if (req.method === 'GET' && action === 'callback') {
    try {
      return await callback(req)
    } catch (err) {
      console.error('Gmail connection failed:', describeError(err))
      return resultPage(req.url, 'failed')
    }
  }

  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session

  try {
    if (req.method === 'GET') {
      switch (action) {
        case 'start':
          return start(req, user)
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
