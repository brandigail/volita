import { neon } from '@neondatabase/serverless'
import { planLimits, type PlanId } from '../../../src/types/plans.ts'

/** The calendar month in UTC, the key the monthly premium voice pool is counted under. */
export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/**
 * Premium voice is paid for per assistant turn, not per spoken sentence: every sentence of one turn carries the same
 * turn id, so the first sentence takes one place in the month's pool and the rest ride along. Returns false when the
 * plan has no premium voice or the pool is used up, and the app then speaks with the device voice instead.
 */
export async function claimVoiceTurn(userId: string, plan: PlanId, turnId: string): Promise<boolean> {
  const pool = planLimits(plan).premiumVoicePerMonth
  if (pool <= 0) return false
  const sql = neon(process.env.DATABASE_URL ?? '')
  const month = currentMonth()
  const [known] = (await sql.query('SELECT 1 AS yes FROM voice_turns WHERE user_id = $1 AND turn_id = $2', [userId, turnId])) as { yes: number }[]
  if (known) return true
  const [{ used }] = (await sql.query('SELECT count(*)::int AS used FROM voice_turns WHERE user_id = $1 AND month = $2', [userId, month])) as { used: number }[]
  if (used >= pool) return false
  await sql.query('INSERT INTO voice_turns (user_id, turn_id, month) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, turnId, month])
  return true
}

export async function voiceTurnsUsed(userId: string): Promise<number> {
  const sql = neon(process.env.DATABASE_URL ?? '')
  const [{ used }] = (await sql.query('SELECT count(*)::int AS used FROM voice_turns WHERE user_id = $1 AND month = $2', [userId, currentMonth()])) as { used: number }[]
  return used
}
