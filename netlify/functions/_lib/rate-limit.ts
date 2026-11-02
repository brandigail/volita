import { neon } from '@neondatabase/serverless'
import { PLAN_RANK, clipsPerRecording, planLimits, type PlanId } from '../../../src/types/plans.ts'
import { errorResponse, upgradeResponse } from './http.ts'
import { describeError } from './safe-log.ts'

export type MeteredEndpoint = 'transcribe' | 'generate' | 'assistant' | 'listen' | 'speak' | 'calendar' | 'feedback' | 'export' | 'memory' | 'lookup' | 'caption'

export interface QuotaLimits {
  /** Calls one user may make in any rolling minute. */
  perMinute: number
  /** Calls one user may make in any rolling 24 hours. */
  perDay: number
  /** Calls all users together may make in any rolling 24 hours; protects the shared Groq quota. */
  globalPerDay: number
}

/** Who is asking: limits depend on the plan, which the server decides (see plan.ts). */
export interface QuotaSubject {
  id: string
  plan: PlanId
}

const DEFAULT_GLOBAL_PER_DAY = 3000

function globalPerDay(): number {
  const configured = Number(process.env.GLOBAL_DAILY_LIMIT)
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_GLOBAL_PER_DAY
}

/** Extra room for a retry or a recording that is thrown away, on top of what a plan's drafts need. */
const RETRY_ALLOWANCE = 1.5

/**
 * Limits for one endpoint on one plan. Drafts a day is counted on `generate`. A recording is cut into 45 second
 * clips and each clip is one `transcribe` call, so recording time is metered as clips: drafts a day times the clips a
 * recording of that plan's length needs. One assistant turn is one `assistant` call; its `listen` clips are allowed
 * a little more room, and its spoken sentences are metered by the premium voice pool in speak.ts, not here.
 */
export function limitsFor(endpoint: MeteredEndpoint, plan: PlanId): QuotaLimits {
  const limits = planLimits(plan)
  switch (endpoint) {
    case 'transcribe':
      return { perMinute: 16, perDay: Math.ceil(limits.draftsPerDay * clipsPerRecording(plan) * RETRY_ALLOWANCE), globalPerDay: Math.max(globalPerDay(), 8000) }
    case 'generate':
      return { perMinute: 10, perDay: limits.draftsPerDay, globalPerDay: globalPerDay() }
    case 'assistant':
      return { perMinute: 6, perDay: limits.assistantTurnsPerDay, globalPerDay: 2000 }
    case 'listen':
      return { perMinute: 12, perDay: Math.ceil(limits.assistantTurnsPerDay * RETRY_ALLOWANCE) + 5, globalPerDay: 3000 }
    case 'export':
      return { perMinute: 2, perDay: 10, globalPerDay: 200 }
    case 'lookup':
      // Each search is a few seconds of Groq browsing and a large share of the free token budget.
      return { perMinute: 3, perDay: limits.webLookupsPerDay, globalPerDay: 200 }
    case 'memory':
      return { perMinute: 30, perDay: 300, globalPerDay: 3000 }
    case 'feedback':
      return { perMinute: 5, perDay: 30, globalPerDay: 500 }
    case 'calendar':
      return { perMinute: 10, perDay: 100, globalPerDay: 1000 }
    case 'speak':
      return { perMinute: 24, perDay: 250, globalPerDay: 5000 }
    case 'caption':
      return { perMinute: 4, perDay: Math.max(10, limits.draftsPerDay), globalPerDay: 300 }
  }
}

interface UsageCounts {
  minute_count: number
  day_count: number
  global_count: number
}

/** Counts a user's recent calls to an endpoint, plus everyone's. `$1` is the user id and `$2` the endpoint. */
const COUNTS_SQL = `
  SELECT
    (count(*) FILTER (WHERE user_id = $1 AND created_at > now() - interval '1 minute'))::int AS minute_count,
    (count(*) FILTER (WHERE user_id = $1))::int AS day_count,
    count(*)::int AS global_count
  FROM api_usage
  WHERE endpoint = $2 AND created_at > now() - interval '24 hours'`

/** Records the call only if every limit still has room, in one statement so concurrent calls can't all slip through. */
const CLAIM_SQL = `
  WITH counts AS (${COUNTS_SQL})
  INSERT INTO api_usage (user_id, endpoint)
  SELECT $1, $2 FROM counts
  WHERE minute_count < $3 AND day_count < $4 AND global_count < $5
  RETURNING id`

/** Old usage rows are only needed for the 24 hour window; trim them now and then instead of running a cron job. */
const PRUNE_SQL = `DELETE FROM api_usage WHERE created_at < now() - interval '3 days'`
const PRUNE_ONE_IN = 50

type QuotaResult = { ok: true } | { ok: false; response: Response }

/**
 * Counts one call against the user's quota. Call it after the request has been validated and before the
 * expensive upstream call, and return `response` as-is when `ok` is false. Fails closed if the database is down.
 */
export async function claimQuota(
  user: QuotaSubject,
  endpoint: MeteredEndpoint,
  limits: QuotaLimits = limitsFor(endpoint, user.plan),
): Promise<QuotaResult> {
  try {
    const sql = neon(process.env.DATABASE_URL ?? '')
    const claimed = await sql.query(CLAIM_SQL, [user.id, endpoint, limits.perMinute, limits.perDay, limits.globalPerDay])
    if (claimed.length > 0) {
      if (Math.random() < 1 / PRUNE_ONE_IN) await sql.query(PRUNE_SQL).catch(() => undefined)
      return { ok: true }
    }

    const [counts] = (await sql.query(COUNTS_SQL, [user.id, endpoint])) as UsageCounts[]
    return { ok: false, response: denial(counts, limits, endpoint, user.plan) }
  } catch (err) {
    console.error('Quota check failed:', describeError(err))
    return { ok: false, response: errorResponse(503, 'Could not check your usage limit. Please try again.') }
  }
}

/** How many calls of an endpoint the user has left in the last 24 hours, for the usage meter. */
export async function remainingToday(user: QuotaSubject, endpoint: MeteredEndpoint): Promise<{ used: number; limit: number }> {
  const sql = neon(process.env.DATABASE_URL ?? '')
  const [counts] = (await sql.query(COUNTS_SQL, [user.id, endpoint])) as UsageCounts[]
  return { used: counts?.day_count ?? 0, limit: limitsFor(endpoint, user.plan).perDay }
}

const NOUN: Record<MeteredEndpoint, string> = {
  transcribe: 'recordings',
  generate: 'drafts',
  assistant: 'assistant turns',
  listen: 'assistant voice clips',
  speak: 'spoken replies',
  calendar: 'calendar checks',
  feedback: 'feedback notes',
  export: 'data downloads',
  memory: 'memory changes',
  lookup: 'web searches',
  caption: 'photo captions',
}

/** The plan above this one, for the upgrade prompt; Pro is the top. */
function nextPlan(plan: PlanId): PlanId | null {
  return plan === 'free' ? 'basic' : plan === 'basic' ? 'pro' : null
}

/** Endpoints whose daily cap is what the plan sells, so hitting it is an invitation to upgrade rather than a fault. */
const PLAN_METERED: readonly MeteredEndpoint[] = ['generate', 'assistant', 'transcribe', 'listen', 'lookup']

function denial(counts: UsageCounts, limits: QuotaLimits, endpoint: MeteredEndpoint, plan: PlanId): Response {
  const noun = NOUN[endpoint]
  if (counts.day_count >= limits.perDay) {
    const upgrade = PLAN_METERED.includes(endpoint) && PLAN_RANK[plan] < PLAN_RANK.pro ? nextPlan(plan) : null
    const message =
      limits.perDay === 0
        ? `Web searches are not part of your plan.`
        : `You have used your ${limits.perDay} ${noun} for the last 24 hours. ${upgrade ? 'Upgrade for more, or try again later.' : 'Please try again later.'}`
    return upgrade ? upgradeResponse(message, upgrade, 429) : errorResponse(429, message)
  }
  if (counts.global_count >= limits.globalPerDay) {
    return errorResponse(429, 'Volita has reached its daily usage limit. Please try again later.')
  }
  const response = errorResponse(429, 'You are going a little fast. Wait a minute and try again.')
  response.headers.set('Retry-After', '60')
  return response
}
