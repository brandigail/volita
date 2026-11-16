import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MAX_REWARDED_REFERRALS, REFERRED_TRIAL_DAYS, REFERRER_REWARD_DAYS, TRIAL_DAYS } from '../../src/types/growth.ts'
import { planLimits } from '../../src/types/plans.ts'
import { resolvePlan } from '../functions/_lib/plan.ts'
import { claimReferral, referralCode, referralState, startTrial, trialState } from '../functions/_lib/pro-access.ts'

/** The free trial and referrals against the real database, with throwaway users. Skipped without a database address. */

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const created: string[] = []
const DAY = 86_400_000

async function makeUser(label: string): Promise<{ id: string; email: string }> {
  const id = `growthtest-${RUN}-${label}`
  const email = `growthtest.${RUN}.${label}@example.com`
  await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, 'Growth Test', email])
  created.push(id)
  return { id, email }
}

async function proUntil(id: string): Promise<number | null> {
  const [row] = (await sql?.query('SELECT pro_until FROM pro_access WHERE user_id = $1', [id])) as { pro_until: string | null }[]
  return row?.pro_until ? new Date(row.pro_until).getTime() : null
}

const daysFromNow = (ms: number | null) => (ms === null ? null : Math.round((ms - Date.now()) / DAY))

describe('plan limits', () => {
  it('give Basic 50 drafts a day and Pro 300', () => {
    expect(planLimits('free').draftsPerDay).toBe(3)
    expect(planLimits('basic').draftsPerDay).toBe(50)
    expect(planLimits('pro').draftsPerDay).toBe(300)
  })
})

suite('free trial', () => {
  let alex: { id: string; email: string }

  beforeAll(async () => {
    alex = await makeUser('alex')
  })
  afterAll(async () => {
    for (const id of created) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })

  it('is available once to a Free account, and gives 14 days of Pro that end by themselves', async () => {
    expect(await resolvePlan(alex.id, alex.email)).toEqual({ plan: 'free', source: 'default' })
    expect(await trialState(alex.id, false)).toMatchObject({ available: true, endsAt: null, lengthDays: TRIAL_DAYS })

    const started = await startTrial(alex.id, false)
    expect(started.ok).toBe(true)
    expect(daysFromNow(await proUntil(alex.id))).toBe(TRIAL_DAYS)
    expect(await resolvePlan(alex.id, alex.email)).toEqual({ plan: 'pro', source: 'trial' })
    expect(await trialState(alex.id, false)).toMatchObject({ available: false })

    await sql?.query("UPDATE pro_access SET pro_until = now() - interval '1 minute' WHERE user_id = $1", [alex.id])
    expect(await resolvePlan(alex.id, alex.email)).toEqual({ plan: 'free', source: 'default' })
    expect(await trialState(alex.id, false)).toMatchObject({ available: false, endsAt: null })
  })

  it('cannot be started a second time, even by two taps at once', async () => {
    expect(await startTrial(alex.id, false)).toEqual({ ok: false, reason: 'used' })
    const bella = await makeUser('bella')
    const results = await Promise.all([startTrial(bella.id, false), startTrial(bella.id, false), startTrial(bella.id, false)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(daysFromNow(await proUntil(bella.id))).toBe(TRIAL_DAYS)
  })

  it('is refused for someone who already has Pro, and never lowers a better plan', async () => {
    const cleo = await makeUser('cleo')
    expect(await startTrial(cleo.id, true)).toEqual({ ok: false, reason: 'already-pro' })
    await sql?.query("INSERT INTO plan_grants (user_id, plan, granted_by, note) VALUES ($1, 'pro', 'test', 'test')", [cleo.id])
    await sql?.query("INSERT INTO pro_access (user_id, pro_until) VALUES ($1, now() + interval '5 days')", [cleo.id])
    expect(await resolvePlan(cleo.id, cleo.email)).toEqual({ plan: 'pro', source: 'grant' })
  })

  it('gives a Basic account Pro during the trial and then Basic again', async () => {
    const dan = await makeUser('dan')
    await sql?.query("INSERT INTO plan_grants (user_id, plan, granted_by, note) VALUES ($1, 'basic', 'test', 'test')", [dan.id])
    expect(await resolvePlan(dan.id, dan.email)).toEqual({ plan: 'basic', source: 'grant' })
    await startTrial(dan.id, false)
    expect(await resolvePlan(dan.id, dan.email)).toEqual({ plan: 'pro', source: 'trial' })
    await sql?.query("UPDATE pro_access SET pro_until = now() - interval '1 minute' WHERE user_id = $1", [dan.id])
    expect(await resolvePlan(dan.id, dan.email)).toEqual({ plan: 'basic', source: 'grant' })
  })
})

suite('referrals', () => {
  afterAll(async () => {
    for (const id of created) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })

  it('gives each person one stable code', async () => {
    const eve = await makeUser('eve')
    const code = await referralCode(eve.id)
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/)
    expect(await referralCode(eve.id)).toBe(code)
    expect((await Promise.all([referralCode(eve.id), referralCode(eve.id)])).every((c) => c === code)).toBe(true)
  })

  it('rewards both sides: the friend gets Pro days and the newcomer a longer trial', async () => {
    const referrer = await makeUser('referrer')
    const friend = await makeUser('friend')
    const code = await referralCode(referrer.id)

    expect(await claimReferral(friend.id, code.toLowerCase())).toEqual({ ok: true })
    expect(daysFromNow(await proUntil(referrer.id))).toBe(REFERRER_REWARD_DAYS)
    expect(await resolvePlan(referrer.id, referrer.email)).toEqual({ plan: 'pro', source: 'trial' })
    expect(await trialState(friend.id, false)).toMatchObject({ available: true, lengthDays: REFERRED_TRIAL_DAYS })
    await startTrial(friend.id, false)
    expect(daysFromNow(await proUntil(friend.id))).toBe(REFERRED_TRIAL_DAYS)
    expect(await referralState(referrer.id)).toMatchObject({ rewardedFriends: 1, daysEarned: REFERRER_REWARD_DAYS })
  })

  it('extends a trial that was started before the link was used', async () => {
    const referrer = await makeUser('ref2')
    const friend = await makeUser('late')
    await startTrial(friend.id, false)
    await claimReferral(friend.id, await referralCode(referrer.id))
    expect(daysFromNow(await proUntil(friend.id))).toBe(REFERRED_TRIAL_DAYS)
  })

  it('refuses unknown codes, your own code, a second referral, and accounts that are not new', async () => {
    const owner = await makeUser('owner')
    const code = await referralCode(owner.id)
    expect(await claimReferral(owner.id, code)).toEqual({ ok: false, reason: 'own-code' })
    const guest = await makeUser('guest')
    expect(await claimReferral(guest.id, 'ZZZZZZZZ')).toEqual({ ok: false, reason: 'unknown-code' })
    expect(await claimReferral(guest.id, code)).toEqual({ ok: true })
    expect(await claimReferral(guest.id, code)).toEqual({ ok: false, reason: 'already-referred' })
    const second = await makeUser('second')
    expect(await claimReferral(second.id, await referralCode(guest.id))).toEqual({ ok: true })
    expect((await referralState(owner.id)).rewardedFriends).toBe(1)

    const veteran = await makeUser('veteran')
    await sql?.query(`UPDATE "user" SET "createdAt" = now() - interval '30 days' WHERE id = $1`, [veteran.id])
    expect(await claimReferral(veteran.id, code)).toEqual({ ok: false, reason: 'not-new' })
  })

  it('stops rewarding after the sixth friend, but the friends still get their longer trial', async () => {
    const generous = await makeUser('generous')
    const code = await referralCode(generous.id)
    for (let i = 0; i < MAX_REWARDED_REFERRALS + 1; i++) {
      const friend = await makeUser(`bulk${i}`)
      expect(await claimReferral(friend.id, code)).toEqual({ ok: true })
    }
    expect(daysFromNow(await proUntil(generous.id))).toBe(MAX_REWARDED_REFERRALS * REFERRER_REWARD_DAYS)
    expect(await referralState(generous.id)).toMatchObject({ rewardedFriends: MAX_REWARDED_REFERRALS, daysEarned: MAX_REWARDED_REFERRALS * REFERRER_REWARD_DAYS })
  })

  it('is removed with the account', async () => {
    const gone = await makeUser('gone')
    await referralCode(gone.id)
    await startTrial(gone.id, false)
    await sql?.query('DELETE FROM "user" WHERE id = $1', [gone.id])
    for (const table of ['referral_codes', 'pro_access']) expect(((await sql?.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [gone.id])) as unknown[]).length).toBe(0)
  })
})
