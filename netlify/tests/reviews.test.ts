import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReviewsResponse } from '../../src/types/reviews.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** The reviews against the real database with throwaway people: public list, one review each, safety check, owner removal. */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const profile = { name: 'T', businessName: '', role: '', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }
const call = (method: string, body?: unknown, path = '/api/reviews') =>
  new Request(`http://localhost:8888${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

suite('reviews', () => {
  let handler: (req: Request) => Promise<Response>
  let ann: SessionUser
  let bob: SessionUser
  let owner: SessionUser
  const ids: string[] = []

  async function person(label: string, name: string, isOwner = false): Promise<SessionUser> {
    const id = `reviewtest-${RUN}-${label}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, name, `reviewtest.${RUN}.${label}@example.com`])
    ids.push(id)
    return { id, email: `reviewtest.${RUN}.${label}@example.com`, plan: 'pro', planSource: 'default', isOwner, profile }
  }
  const list = async () => (await (await handler(call('GET'))).json()) as ReviewsResponse

  beforeAll(async () => {
    handler = (await import('../functions/reviews.ts')).default
    ann = await person('ann', 'Ann Botha')
    bob = await person('bob', 'Bob Smith')
    owner = await person('owner', 'Brandon M', true)
  })
  afterAll(async () => {
    for (const id of ids) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })
  beforeEach(async () => {
    await sql?.query('DELETE FROM api_usage WHERE user_id LIKE $1', [`reviewtest-${RUN}-%`])
    hoisted.current = ann
  })

  it('shows anyone the reviews without signing in, and refuses a review without an account', async () => {
    hoisted.current = null
    expect((await handler(call('GET'))).status).toBe(200)
    expect((await handler(call('POST', { rating: 5, comment: 'x' }))).status).toBe(401)
  })

  it('refuses a rating outside 1 to 5 and a comment that is too long', async () => {
    expect((await handler(call('POST', { rating: 0 }))).status).toBe(400)
    expect((await handler(call('POST', { rating: 6 }))).status).toBe(400)
    expect((await handler(call('POST', { rating: 4, comment: 'x'.repeat(601) }))).status).toBe(400)
  })

  it('saves a review, shows only the first name, and counts it in the average', async () => {
    expect((await handler(call('POST', { rating: 4, comment: 'The voice quotes are great but the Gmail step confused me.' }))).status).toBe(201)
    hoisted.current = bob
    expect((await handler(call('POST', { rating: 2, comment: 'Could not find the microphone.' }))).status).toBe(201)
    const data = await list()
    const mine = data.reviews.filter((review) => review.name === 'Ann' || review.name === 'Bob')
    expect(mine.map((review) => review.name).sort()).toEqual(['Ann', 'Bob'])
    expect(JSON.stringify(data)).not.toMatch(/Botha|Smith|@example\.com|reviewtest-/)
    expect(data.count).toBeGreaterThanOrEqual(2)
    expect(data.average).not.toBeNull()
  })

  it('lets a person change theirs instead of adding a second one', async () => {
    expect((await handler(call('POST', { rating: 5, comment: 'Updated: it is much better now.' }))).status).toBe(201)
    const [{ n }] = (await sql?.query('SELECT count(*)::int AS n FROM reviews WHERE user_id = $1', [ann.id])) as { n: number }[]
    expect(n).toBe(1)
    expect(await (await handler(call('GET', undefined, '/api/reviews?mine=1'))).json()).toEqual({ review: { rating: 5, comment: 'Updated: it is much better now.' } })
  })

  it('stops a review that holds a card number', async () => {
    const res = await handler(call('POST', { rating: 3, comment: 'My card is 4539 1488 0343 6467 if you want to test.' }))
    expect(res.status).toBe(422)
    expect(((await res.json()) as { code: string }).code).toBe('sensitive')
  })

  it('only the owner can remove someone else’s review, and a person can delete their own', async () => {
    const [{ id }] = (await sql?.query('SELECT id FROM reviews WHERE user_id = $1', [bob.id])) as { id: string }[]
    hoisted.current = ann
    expect((await handler(call('DELETE', { id }))).status).toBe(403)
    hoisted.current = owner
    expect(await (await handler(call('DELETE', { id }))).json()).toEqual({ removed: true })
    expect((await sql?.query('SELECT 1 FROM reviews WHERE user_id = $1', [bob.id]))?.length).toBe(0)
    hoisted.current = ann
    await handler(call('DELETE', {}))
    expect((await sql?.query('SELECT 1 FROM reviews WHERE user_id = $1', [ann.id]))?.length).toBe(0)
  })
})
