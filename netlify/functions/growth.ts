import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { errorResponse, json } from './_lib/http.ts'
import { claimReferral, referralState, startTrial } from './_lib/pro-access.ts'
import { requireUser } from './_lib/session.ts'
import { describeError } from './_lib/safe-log.ts'

const claimBody = z.object({ code: z.string().trim().min(4).max(16) })

/** Requests that change something must come from the app itself: JSON, and an Origin (when sent) that is this site. */
function fromThisSite(req: Request): boolean {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return false
  const origin = req.headers.get('origin')
  return origin === null || origin === new URL(req.url).origin
}

const REFERRAL_MESSAGES = {
  'unknown-code': 'That referral link is not valid.',
  'own-code': 'You cannot use your own referral link.',
  'already-referred': 'A referral link was already used for this account.',
  'not-new': 'Referral links only work for brand new accounts.',
} as const

/** Routes: POST /api/trial/start, GET /api/referral, POST /api/referral/claim. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session
  const path = new URL(req.url).pathname

  try {
    if (req.method === 'GET' && path === '/api/referral') return json(await referralState(user.id))
    if (req.method === 'POST') {
      if (!fromThisSite(req)) return errorResponse(400, 'That request did not come from the app.')
      if (path === '/api/trial/start') {
        const result = await startTrial(user.id, user.plan === 'pro' && user.planSource !== 'trial')
        if (result.ok) return json({ started: true, endsAt: result.endsAt })
        return errorResponse(409, result.reason === 'used' ? 'You have already used your free trial.' : 'You already have Pro.')
      }
      if (path === '/api/referral/claim') {
        const body = claimBody.safeParse(await req.json().catch(() => null))
        if (!body.success) return errorResponse(400, 'That referral link is not valid.')
        const result = await claimReferral(user.id, body.data.code)
        return result.ok ? json({ claimed: true }) : errorResponse(409, REFERRAL_MESSAGES[result.reason])
      }
    }
    return errorResponse(404, 'Not found.')
  } catch (err) {
    console.error('Growth request failed:', describeError(err))
    return errorResponse(500, 'Something went wrong. Please try again.')
  }
}

export const config: Config = { path: ['/api/trial/start', '/api/referral', '/api/referral/claim'] }
