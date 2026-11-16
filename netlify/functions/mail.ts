import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { GMAIL_RETURN_PARAM } from '../../src/types/gmail.ts'
import { IMAP_PORTS, SMTP_PORTS, presetFor, type MailStatus } from '../../src/types/mail.ts'
import { planLimits } from '../../src/types/plans.ts'
import { forgetAccessToken } from './_lib/gmail-api.ts'
import { resultPage } from './_lib/gmail-pages.ts'
import { deleteConnection, getConnection, logGmail } from './_lib/gmail-store.ts'
import { createState, googleConfigured, readState, revokeToken } from './_lib/google-oauth.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { verifyPasswordAccount } from './_lib/imap-mail.ts'
import { checkMailHost } from './_lib/mail-host.ts'
import { deleteAccount, getAccount, saveAccount } from './_lib/mail-store.ts'
import { buildMicrosoftAuthUrl, exchangeMicrosoftCode, hasOutlookScopes, microsoftConfigured } from './_lib/microsoft-oauth.ts'
import { forgetOutlookToken } from './_lib/outlook-mail.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser, type SessionUser } from './_lib/session.ts'

/** Connecting any email service except Gmail (which has /api/gmail/start), the shared status, and disconnecting. */

const server = (ports: readonly number[]) => z.object({ host: z.string().trim().min(4).max(253), port: z.number().int().refine((port) => ports.includes(port)) })

const connectSchema = z.object({
  provider: z.enum(['yahoo', 'aol', 'icloud', 'zoho', 'other']),
  email: z.email().max(254),
  password: z.string().min(4).max(200),
  imap: server(IMAP_PORTS).optional(),
  smtp: server(SMTP_PORTS).optional(),
})

function backToApp(requestUrl: string, code: string): Response {
  const target = new URL('/', requestUrl)
  target.searchParams.set(GMAIL_RETURN_PARAM, code)
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } })
}

function fromThisSite(req: Request): boolean {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return false
  const origin = req.headers.get('origin')
  return origin === null || origin === new URL(req.url).origin
}

async function status(user: SessionUser): Promise<Response> {
  const [account, gmail] = await Promise.all([getAccount(user.id), getConnection(user.id)])
  const base = { allowed: planLimits(user.plan).email, googleReady: googleConfigured(), microsoftReady: microsoftConfigured() }
  if (account) return json<MailStatus>({ ...base, connected: true, provider: account.provider, email: account.email, needsReconnect: account.needsReconnect, connectedAt: account.connectedAt })
  if (gmail) return json<MailStatus>({ ...base, connected: true, provider: 'gmail', email: gmail.email, needsReconnect: gmail.needsReconnect, connectedAt: gmail.connectedAt })
  return json<MailStatus>({ ...base, connected: false, provider: null, email: null, needsReconnect: false, connectedAt: null })
}

/** Yahoo, AOL, iCloud, Zoho or business email: the details are tried for real before anything is saved. */
async function connect(req: Request, user: SessionUser): Promise<Response> {
  if (!planLimits(user.plan).email) return upgradeResponse('Email is part of the Pro plan.', 'pro')
  const input = connectSchema.safeParse(await req.json().catch(() => null))
  if (!input.success) return errorResponse(400, 'Give your email address, the password, and (for other email) the mail server names.')
  // Each try reaches the email company, so tries are limited like other email requests.
  const quota = await claimQuota(user, 'email')
  if (!quota.ok) return quota.response

  const { provider, email } = input.data
  const preset = presetFor(provider)
  const imap = preset.imap ?? (input.data.imap ? { ...input.data.imap, secure: true } : null)
  const smtp = preset.smtp ?? (input.data.smtp ? { ...input.data.smtp, secure: input.data.smtp.port === 465 } : null)
  if (!imap || !smtp) return errorResponse(400, 'Give the incoming (IMAP) and outgoing (SMTP) server names.')
  // App passwords are often shown in groups ("abcd efgh ijkl mnop"); the spaces are not part of them.
  const password = provider === 'other' ? input.data.password : input.data.password.replace(/\s+/g, '')

  for (const host of [imap.host, smtp.host]) {
    const checked = await checkMailHost(host)
    if (!checked.ok) return errorResponse(400, checked.message)
  }
  const verified = await verifyPasswordAccount({ email, password, imap, smtp })
  if (!verified.ok) {
    const where = verified.side === 'imap' ? 'reading mail' : 'sending mail'
    return errorResponse(
      400,
      verified.auth
        ? `${preset.label} did not accept that email and password (for ${where}). Check the address, and use an app password if your email has one.`
        : `Could not reach the server for ${where}. Check the server name and that IMAP is turned on in your email settings.`,
    )
  }
  await saveAccount(user.id, provider, email.toLowerCase(), password, { imap, smtp })
  await logGmail(user.id, 'connect', email.toLowerCase())
  return json({ connected: true })
}

function outlookStart(req: Request, user: SessionUser): Response {
  if (!planLimits(user.plan).email) return backToApp(req.url, 'plan')
  if (!microsoftConfigured()) return backToApp(req.url, 'not_configured')
  return new Response(null, { status: 302, headers: { Location: buildMicrosoftAuthUrl(req.url, createState(user.id), user.email), 'Cache-Control': 'no-store' } })
}

/** Where Microsoft sends the person back to. Like Gmail's, it trusts the signed state, not the sign-in cookie. */
async function outlookCallback(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams
  if (params.get('error')) return resultPage(req.url, 'denied', 'Outlook')
  const code = params.get('code')
  const userId = readState(params.get('state') ?? '')
  if (!code || !userId) return resultPage(req.url, 'failed', 'Outlook')
  const exchanged = await exchangeMicrosoftCode(code, req.url)
  if (!exchanged.ok) return resultPage(req.url, 'failed', 'Outlook')
  const { scope, refreshToken, email } = exchanged.tokens
  if (!hasOutlookScopes(scope)) return resultPage(req.url, 'scopes', 'Outlook')
  if (!refreshToken || !email) return resultPage(req.url, 'failed', 'Outlook')
  await saveAccount(userId, 'outlook', email, refreshToken, null)
  forgetOutlookToken(userId)
  await logGmail(userId, 'connect', email)
  return resultPage(req.url, 'connected', 'Outlook')
}

/** Removes whichever mailbox is connected. Google is also told to forget its permission. */
async function disconnect(user: SessionUser): Promise<Response> {
  const [account, gmail] = await Promise.all([getAccount(user.id), getConnection(user.id)])
  if (gmail) await revokeToken(gmail.refreshToken)
  await deleteConnection(user.id)
  await deleteAccount(user.id)
  forgetAccessToken(user.id)
  forgetOutlookToken(user.id)
  await logGmail(user.id, 'disconnect', account?.email ?? gmail?.email ?? '')
  return json({ disconnected: true, provider: account?.provider ?? (gmail ? 'gmail' : null) })
}

/** Routes: /api/mail/status, /api/mail/connect, /api/mail/disconnect, /api/mail/outlook/start and /api/mail/outlook/callback. */
export default async function handler(req: Request): Promise<Response> {
  const [, , action, step] = new URL(req.url).pathname.split('/').filter(Boolean)
  if (req.method === 'GET' && action === 'outlook' && step === 'callback') {
    try {
      return await outlookCallback(req)
    } catch (err) {
      console.error('Outlook connection failed:', describeError(err))
      return resultPage(req.url, 'failed', 'Outlook')
    }
  }

  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session
  try {
    if (req.method === 'GET' && action === 'status') return await status(user)
    if (req.method === 'GET' && action === 'outlook' && step === 'start') return outlookStart(req, user)
    if (req.method === 'POST') {
      if (!fromThisSite(req)) return errorResponse(400, 'That request did not come from the app.')
      if (action === 'connect') return await connect(req, user)
      if (action === 'disconnect') return await disconnect(user)
    }
    return errorResponse(404, 'Not found.')
  } catch (err) {
    console.error('Email request failed:', describeError(err))
    return errorResponse(500, 'Something went wrong with your email. Please try again.')
  }
}

export const config: Config = { path: '/api/mail/*' }
