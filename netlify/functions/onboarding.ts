import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { planLimits } from '../../src/types/plans.ts'
import { errorResponse, json } from './_lib/http.ts'
import { addMemory } from './_lib/memory-store.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

const answersSchema = z.object({
  /** Who they usually write to, in their own words. */
  audience: z.string().trim().max(150).optional(),
  /** How their messages should sound. */
  tone: z.string().trim().max(150).optional(),
})

/**
 * Finishes the three-question welcome. The first answer (what they do) is saved to the profile by the app; the other
 * two become memories for plans that have memory. Either way the welcome is marked done and does not come back.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed.')
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session

  const answers = answersSchema.safeParse(await req.json().catch(() => ({})))
  if (!answers.success) return errorResponse(400, 'Those answers are too long.')

  try {
    const cap = planLimits(user.plan).memoryItems
    const saved: string[] = []
    if (cap !== 0) {
      const { audience, tone } = answers.data
      if (tone) {
        const result = await addMemory(user.id, 'preference', `Messages should sound ${tone}.`, { cap })
        if (result.ok) saved.push('tone')
      }
      if (audience) {
        const result = await addMemory(user.id, 'fact', `Usually writes to ${audience}.`, { cap })
        if (result.ok) saved.push('audience')
      }
    }
    const sql = neon(process.env.DATABASE_URL ?? '')
    await sql.query(
      `INSERT INTO user_flags (user_id, onboarded_at) VALUES ($1, now())
       ON CONFLICT (user_id) DO UPDATE SET onboarded_at = COALESCE(user_flags.onboarded_at, now())`,
      [user.id],
    )
    return json({ done: true, remembered: saved })
  } catch (err) {
    console.error('Onboarding failed:', describeError(err))
    return errorResponse(500, 'Could not save that. Please try again.')
  }
}

export const config: Config = { path: '/api/onboarding' }
