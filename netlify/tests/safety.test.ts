import { neon } from '@neondatabase/serverless'
import { afterAll, describe, expect, it } from 'vitest'
import { TERMS_VERSION } from '../../src/lib/terms.ts'
import { STRIKE_LIMIT } from '../../src/types/safety.ts'
import { requireUser } from '../functions/_lib/session.ts'
import { isSuspended, reopenUser, suspendUser } from '../functions/_lib/account-status.ts'
import { auth } from '../functions/_lib/auth.ts'
import { noteLimitHit, refuseSensitive, safetyCounts, textsIn } from '../functions/_lib/safety.ts'

/** The safety checks, the age rule and closing accounts, against the real database with throwaway users. */

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const created: string[] = []
const PASSWORD = 'safety-test-password-1'

async function signUp(label: string, birthDate?: string, termsVersion: string | null = TERMS_VERSION): Promise<{ id: string; email: string }> {
  const email = `safetytest.${RUN}.${label}@example.com`
  const result = await auth.api.signUpEmail({ body: { name: 'Safety Test', email, password: PASSWORD, ...(birthDate ? { birthDate } : {}), ...(termsVersion ? { termsVersion } : {}) } })
  created.push(result.user.id)
  return { id: result.user.id, email }
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'no error'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

afterAll(async () => {
  for (const id of created) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
})

describe('textsIn', () => {
  it('finds every piece of text inside a request body', () => {
    expect(textsIn({ a: 'one', b: ['two', { c: 'three' }], n: 4, z: null })).toEqual(['one', 'two', 'three'])
  })
})

suite('age rule at sign-up', () => {
  it('refuses an account without a date of birth, or under 18', async () => {
    expect(await refusal(signUp('nodate'))).toMatch(/date of birth/i)
    expect(await refusal(signUp('young', '2012-05-01'))).toMatch(/18 and over/)
  })

  it('creates the account for an adult', async () => {
    const adult = await signUp('adult', '1990-05-01')
    const [row] = (await sql?.query('SELECT "birthDate" FROM "user" WHERE id = $1', [adult.id])) as { birthDate: string }[]
    expect(row.birthDate).toBe('1990-05-01')
  })
})

suite('terms of use', () => {
  it('refuses an account that has not accepted the current terms', async () => {
    expect(await refusal(signUp('noterms', '1990-05-01', null))).toMatch(/terms of use/)
    expect(await refusal(signUp('oldterms', '1990-05-01', '2020-01-01'))).toMatch(/terms of use/)
  })

  it('records the accepted version and when, and locks out an account until it accepts the current version', async () => {
    const person = await signUp('terms', '1990-05-01')
    const [row] = (await sql?.query('SELECT "termsVersion", "termsAcceptedAt" FROM "user" WHERE id = $1', [person.id])) as { termsVersion: string; termsAcceptedAt: Date | null }[]
    expect(row.termsVersion).toBe(TERMS_VERSION)
    expect(row.termsAcceptedAt).not.toBeNull()

    const signedIn = await auth.api.signInEmail({ body: { email: person.email, password: PASSWORD }, asResponse: true })
    const cookie = (signedIn.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ')
    const request = () => new Request('http://localhost:8888/api/plan', { headers: { cookie } })
    expect((await requireUser(request())).ok).toBe(true)

    // The terms change (or the account predates them): every request is refused until they are accepted again.
    await sql?.query('UPDATE "user" SET "termsVersion" = $2 WHERE id = $1', [person.id, '2020-01-01'])
    const refused = await requireUser(request())
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.response.status).toBe(428)
      expect(await refused.response.json()).toMatchObject({ code: 'terms_required' })
    }
  })
})

suite('protected details', () => {
  it('lets ordinary text through and records nothing', async () => {
    const person = await signUp('clean', '1985-01-01')
    expect(await refuseSensitive(person, 'Quote for Mrs Jones, geyser 4 800, call 082 123 4567', 'test')).toBeNull()
    expect((await safetyCounts(person.id)).sensitive).toBe(0)
  })

  it('refuses card numbers, counts each try and never stores the text', async () => {
    const person = await signUp('cards', '1985-01-01')
    let last: Response | null = null
    for (let i = 0; i < STRIKE_LIMIT; i++) last = await refuseSensitive(person, { body: 'her card is 4111 1111 1111 1111' }, 'test')
    expect(last?.status).toBe(422)
    const body = (await last?.json()) as { code: string; strikes: number; error: string }
    expect(body.code).toBe('sensitive')
    expect(body.strikes).toBe(STRIKE_LIMIT)
    expect(body.error).toMatch(/owner has been told/)
    const rows = (await sql?.query('SELECT kind, source, owner_told FROM safety_events WHERE user_id = $1', [person.id])) as { kind: string; source: string; owner_told: boolean }[]
    expect(rows).toHaveLength(STRIKE_LIMIT)
    expect(rows.every((row) => row.kind === 'card' && !JSON.stringify(row).includes('4111'))).toBe(true)
    expect(rows.some((row) => row.owner_told)).toBe(true)
  })

  it('counts limit refusals', async () => {
    const person = await signUp('limits', '1985-01-01')
    await noteLimitHit(person.id, 'generate')
    await noteLimitHit(person.id, 'generate')
    expect((await safetyCounts(person.id)).limit).toBe(2)
  })
})

suite('closing an account', () => {
  it('signs the person out everywhere, stops sign-in, and reopening lets them back', async () => {
    const person = await signUp('closed', '1980-03-03')
    await suspendUser(person.id, 'Test')
    expect(await isSuspended(person.id)).toBe(true)
    const [{ sessions }] = (await sql?.query('SELECT count(*)::int AS sessions FROM "session" WHERE "userId" = $1', [person.id])) as { sessions: number }[]
    expect(sessions).toBe(0)
    expect(await refusal(auth.api.signInEmail({ body: { email: person.email, password: PASSWORD } }))).toMatch(/closed/)

    await reopenUser(person.id)
    const signedIn = await auth.api.signInEmail({ body: { email: person.email, password: PASSWORD } })
    expect(signedIn.user.id).toBe(person.id)
  })
})
