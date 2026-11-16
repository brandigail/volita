import { z } from 'zod'
import { ApiRequestError, request } from './api'

const referralSchema = z.object({ code: z.string(), rewardedFriends: z.number(), daysEarned: z.number(), maxFriends: z.number() })
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Starts the free Pro trial (once per account, no card). Resolves to when it ends. */
export async function startTrial(): Promise<string> {
  const data = z.object({ started: z.literal(true), endsAt: z.string() }).safeParse(await request('/api/trial/start', post({})))
  if (!data.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
  return data.data.endsAt
}

export async function fetchReferral() {
  const data = referralSchema.safeParse(await request('/api/referral', { method: 'GET' }))
  if (!data.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
  return data.data
}

export async function claimReferral(code: string): Promise<void> {
  await request('/api/referral/claim', post({ code }))
}
