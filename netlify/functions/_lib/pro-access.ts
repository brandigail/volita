import { neon } from '@neondatabase/serverless'
import { randomInt } from 'node:crypto'
import { MAX_REWARDED_REFERRALS, REFERRED_TRIAL_DAYS, REFERRER_REWARD_DAYS, TRIAL_DAYS, type ReferralState, type TrialState } from '../../../src/types/growth.ts'

/**
 * Free Pro time: the 14 day trial (no card), and the days friends earn each other through a referral. It is one value per
 * person, `pro_until`: any time before then counts as Pro unless they already have a better plan. Everything is decided here.
 */

const sql = () => neon(process.env.DATABASE_URL ?? '')

/** A referral only counts for an account that is really new, so an old account cannot be "referred" for a reward. */
const NEW_ACCOUNT_DAYS = 3
// No 0, O, 1, I or L: a code is often read out or typed from a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

interface AccessRow {
  pro_until: string | Date | null
  trial_started_at: string | Date | null
  referred: boolean
}

async function getRow(userId: string): Promise<AccessRow | null> {
  const [row] = (await sql().query('SELECT pro_until, trial_started_at, referred FROM pro_access WHERE user_id = $1', [userId])) as AccessRow[]
  return row ?? null
}

/** When Pro time from a trial or referral ends, or null if there is none running. */
export function runningUntil(proUntil: string | Date | null, now = Date.now()): Date | null {
  if (!proUntil) return null
  const until = new Date(proUntil)
  return until.getTime() > now ? until : null
}

export function trialLength(referred: boolean): number {
  return referred ? REFERRED_TRIAL_DAYS : TRIAL_DAYS
}

/** The trial as the app shows it. `alreadyPro` is true for the owner or anyone on Pro through a grant or subscription. */
export async function trialState(userId: string, alreadyPro: boolean): Promise<TrialState> {
  const row = await getRow(userId)
  const until = runningUntil(row?.pro_until ?? null)
  return {
    endsAt: until ? until.toISOString() : null,
    available: !alreadyPro && !row?.trial_started_at,
    lengthDays: trialLength(row?.referred ?? false),
  }
}

export type StartResult = { ok: true; endsAt: string } | { ok: false; reason: 'used' | 'already-pro' }

/** Starts the free trial, once per account. The claim is one statement, so two taps cannot start it twice. */
export async function startTrial(userId: string, alreadyPro: boolean): Promise<StartResult> {
  if (alreadyPro) return { ok: false, reason: 'already-pro' }
  const existing = await getRow(userId)
  const days = trialLength(existing?.referred ?? false)
  const [claimed] = (await sql().query(
    `INSERT INTO pro_access (user_id, pro_until, trial_started_at) VALUES ($1, now() + make_interval(days => $2), now())
     ON CONFLICT (user_id) DO UPDATE SET trial_started_at = now(),
       pro_until = greatest(coalesce(pro_access.pro_until, now()), now()) + make_interval(days => $2)
       WHERE pro_access.trial_started_at IS NULL
     RETURNING pro_until`,
    [userId, days],
  )) as { pro_until: string | Date }[]
  return claimed ? { ok: true, endsAt: new Date(claimed.pro_until).toISOString() } : { ok: false, reason: 'used' }
}

// ---------- Referrals ----------

function makeCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}

/** The person's own referral code, made the first time it is asked for. */
export async function referralCode(userId: string): Promise<string> {
  const [existing] = (await sql().query('SELECT code FROM referral_codes WHERE user_id = $1', [userId])) as { code: string }[]
  if (existing) return existing.code
  for (let attempt = 0; attempt < 5; attempt++) {
    const [made] = (await sql().query('INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code', [userId, makeCode()])) as { code: string }[]
    if (made) return made.code
    const [raced] = (await sql().query('SELECT code FROM referral_codes WHERE user_id = $1', [userId])) as { code: string }[]
    if (raced) return raced.code
  }
  throw new Error('Could not make a referral code')
}

export async function referralState(userId: string): Promise<ReferralState> {
  const code = await referralCode(userId)
  const [counts] = (await sql().query('SELECT count(*)::int AS friends FROM referrals WHERE referrer_id = $1', [userId])) as { friends: number }[]
  const rewarded = Math.min(counts?.friends ?? 0, MAX_REWARDED_REFERRALS)
  return { code, rewardedFriends: rewarded, daysEarned: rewarded * REFERRER_REWARD_DAYS, maxFriends: MAX_REWARDED_REFERRALS }
}

export type ClaimResult = { ok: true } | { ok: false; reason: 'unknown-code' | 'own-code' | 'already-referred' | 'not-new' }

/**
 * A new person arrived through a friend's link. They get a longer trial, and the friend gets Pro days, up to a cap.
 * Each person can be referred once, and the claim is a single insert, so repeating it changes nothing.
 */
export async function claimReferral(newUserId: string, rawCode: string): Promise<ClaimResult> {
  const code = rawCode.trim().toUpperCase()
  const [owner] = (await sql().query('SELECT user_id FROM referral_codes WHERE code = $1', [code])) as { user_id: string }[]
  if (!owner) return { ok: false, reason: 'unknown-code' }
  if (owner.user_id === newUserId) return { ok: false, reason: 'own-code' }

  const [fresh] = (await sql().query(`SELECT 1 AS ok FROM "user" WHERE id = $1 AND "createdAt" > now() - make_interval(days => $2)`, [newUserId, NEW_ACCOUNT_DAYS])) as unknown[]
  if (!fresh) return { ok: false, reason: 'not-new' }

  const [claimed] = (await sql().query('INSERT INTO referrals (referred_id, referrer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING referred_id', [newUserId, owner.user_id])) as unknown[]
  if (!claimed) return { ok: false, reason: 'already-referred' }

  // The new person: a longer trial (or, if they already started one, the extra days on the end of it).
  await sql().query(
    `INSERT INTO pro_access (user_id, referred) VALUES ($1, true)
     ON CONFLICT (user_id) DO UPDATE SET referred = true,
       pro_until = CASE WHEN pro_access.trial_started_at IS NOT NULL THEN greatest(coalesce(pro_access.pro_until, now()), now()) + make_interval(days => $2) ELSE pro_access.pro_until END`,
    [newUserId, REFERRED_TRIAL_DAYS - TRIAL_DAYS],
  )
  // The friend: Pro days, but only for the first few people, so the reward cannot be farmed.
  const [rewards] = (await sql().query('SELECT count(*)::int AS friends FROM referrals WHERE referrer_id = $1', [owner.user_id])) as { friends: number }[]
  if ((rewards?.friends ?? 0) <= MAX_REWARDED_REFERRALS) {
    await sql().query(
      `INSERT INTO pro_access (user_id, pro_until) VALUES ($1, now() + make_interval(days => $2))
       ON CONFLICT (user_id) DO UPDATE SET pro_until = greatest(coalesce(pro_access.pro_until, now()), now()) + make_interval(days => $2)`,
      [owner.user_id, REFERRER_REWARD_DAYS],
    )
  }
  return { ok: true }
}
