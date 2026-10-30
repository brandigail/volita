import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import type { PlanState } from '../../src/types/plan-state.ts'
import { planLimits } from '../../src/types/plans.ts'
import { errorResponse, json } from './_lib/http.ts'
import { remainingToday } from './_lib/rate-limit.ts'
import { requireUser } from './_lib/session.ts'
import { describeError } from './_lib/safe-log.ts'
import { voiceTurnsUsed } from './_lib/voice-pool.ts'

/** The signed-in person's plan, limits and how much of today's allowance is used. The app shows it; the server enforces it. */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed.')
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session

  try {
    const sql = neon(process.env.DATABASE_URL ?? '')
    const [drafts, assistant, voiceUsed, flags] = await Promise.all([
      remainingToday(user, 'generate'),
      remainingToday(user, 'assistant'),
      voiceTurnsUsed(user.id),
      sql.query('SELECT onboarded_at FROM user_flags WHERE user_id = $1', [user.id]),
    ])
    const limits = planLimits(user.plan)
    return json<PlanState>({
      plan: user.plan,
      source: user.planSource,
      isOwner: user.isOwner,
      limits,
      usage: {
        draftsUsed: drafts.used,
        draftsLimit: drafts.limit,
        assistantUsed: assistant.used,
        assistantLimit: assistant.limit,
        voiceUsed,
        voiceLimit: limits.premiumVoicePerMonth,
      },
      onboarded: Boolean(flags[0]?.onboarded_at),
    })
  } catch (err) {
    console.error('Plan lookup failed:', describeError(err))
    return errorResponse(500, 'Could not load your plan. Please try again.')
  }
}

export const config: Config = { path: '/api/plan' }
