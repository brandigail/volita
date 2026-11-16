import { neon } from '@neondatabase/serverless'
import { PLAN_RANK, isPlanId, type PlanId } from '../../../src/types/plans.ts'

export type PlanSource = 'owner' | 'grant' | 'subscription' | 'trial' | 'default'

export interface ResolvedPlan {
  plan: PlanId
  source: PlanSource
}

/** Accounts that run the app: `OWNER_EMAILS` is a comma separated list. They always get Pro and see the family screen. */
export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? '')
    .toLowerCase()
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function isOwner(email: string): boolean {
  return ownerEmails().includes(email.toLowerCase())
}

interface PlanRow {
  granted: string | null
  subscribed: string | null
  /** Pro time from a free trial or a referral that has not run out yet. */
  pro_until: string | Date | null
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
       (SELECT plan FROM subscriptions WHERE user_id = $1 AND status = 'active') AS subscribed,
       (SELECT pro_until FROM pro_access WHERE user_id = $1 AND pro_until > now()) AS pro_until`,
    [userId, email],
  )) as PlanRow[]
  const granted = isPlanId(row?.granted) ? row.granted : null
  const subscribed = isPlanId(row?.subscribed) ? row.subscribed : null
  const best = granted && (!subscribed || PLAN_RANK[granted] >= PLAN_RANK[subscribed]) ? { plan: granted, source: 'grant' as const } : subscribed ? { plan: subscribed, source: 'subscription' as const } : { plan: 'free' as const, source: 'default' as const }
  // A free trial or referral gives Pro, but never takes anything away from a plan that is already Pro.
  if (row?.pro_until && best.plan !== 'pro') return { plan: 'pro', source: 'trial' }
  return best
}
