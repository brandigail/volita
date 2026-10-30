import { neon } from '@neondatabase/serverless'
import { PLAN_RANK, isPlanId, type PlanId } from '../../../src/types/plans.ts'

export type PlanSource = 'owner' | 'grant' | 'subscription' | 'default'

export interface ResolvedPlan {
  plan: PlanId
  source: PlanSource
}

/** Accounts that run the app: `OWNER_EMAILS` is a comma separated list. They always get Pro and see the family screen. */
export function isOwner(email: string): boolean {
  return (process.env.OWNER_EMAILS ?? '')
    .toLowerCase()
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(email.toLowerCase())
}

interface PlanRow {
  granted: string | null
  subscribed: string | null
}

/**
 * The one place that decides which plan a person is on: the owner is always Pro, then the best of a plan the owner
 * granted by hand (to the account, or to an email address before it signs up) and an active paid subscription, otherwise Free. Every function asks here; the browser only displays it.
 */
export async function resolvePlan(userId: string, email: string): Promise<ResolvedPlan> {
  if (isOwner(email)) return { plan: 'pro', source: 'owner' }
  const sql = neon(process.env.DATABASE_URL ?? '')
  const [row] = (await sql.query(
    `SELECT
       COALESCE(
         (SELECT plan FROM plan_grants WHERE user_id = $1),
         (SELECT plan FROM plan_invites WHERE email = lower($2))
       ) AS granted,
       (SELECT plan FROM subscriptions WHERE user_id = $1 AND status = 'active') AS subscribed`,
    [userId, email],
  )) as PlanRow[]
  const granted = isPlanId(row?.granted) ? row.granted : null
  const subscribed = isPlanId(row?.subscribed) ? row.subscribed : null
  if (!granted && !subscribed) return { plan: 'free', source: 'default' }
  if (granted && (!subscribed || PLAN_RANK[granted] >= PLAN_RANK[subscribed])) return { plan: granted, source: 'grant' }
  return { plan: subscribed ?? 'free', source: 'subscription' }
}
