import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanId } from '../../src/types/plans.ts'
import { cardReadingSchema, receiptReadingSchema } from '../../src/types/scan.ts'
import { parseReading } from '../functions/_lib/vision-reader.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** Reading business cards and receipts: the reading rules, and the functions with the AI service mocked. */

const hoisted = vi.hoisted(() => ({
  current: null as SessionUser | null,
  replies: [] as ({ ok: true; content: string; toolCalls: [] } | { ok: false; status: number })[],
  calls: 0,
}))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))
vi.mock('../functions/_lib/groq-chat.ts', () => ({
  chat: async () => {
    hoisted.calls += 1
    return hoisted.replies.shift() ?? { ok: false, status: 500 }
  },
}))

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const ok = (value: unknown) => ({ ok: true as const, content: JSON.stringify(value), toolCalls: [] as [] })

describe('card and receipt readings', () => {
  it('turns missing card fields into empty text and trims what is there', () => {
    const parsed = parseReading(cardReadingSchema, '{"name": "  Sipho   Dlamini ", "company": null, "phone": "082 555 0101"}')
    expect(parsed).toEqual({ ok: true, value: { name: 'Sipho Dlamini', company: '', role: '', phone: '082 555 0101', email: '' } })
  })

  it('reads receipt amounts into cents from numbers or text, and drops what is not a sensible amount', () => {
    const read = (json: string) => (parseReading(receiptReadingSchema, json) as { ok: true; value: { totalCents: number | null; vatCents: number | null; date: string } }).value
    expect(read('{"supplier":"Spar","date":"2026-11-19","total":245.5,"vat":"R 32,02"}')).toMatchObject({ totalCents: 24_550, vatCents: 3_202, date: '2026-11-19' })
    expect(read('{"supplier":"Spar","date":"19/11/2026","total":null,"vat":-5}')).toMatchObject({ totalCents: null, vatCents: null, date: '' })
  })

  it('copes with a reply wrapped in a code fence, and says why a bad one failed', () => {
    expect(parseReading(cardReadingSchema, '```json\n{"name":"A"}\n```')).toMatchObject({ ok: true })
    expect(parseReading(cardReadingSchema, 'sorry, I cannot')).toEqual({ ok: false, problem: 'it was not valid JSON' })
  })
})

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const profile = { name: 'T', businessName: '', role: '', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }
const post = (path: string, body: unknown) => new Request(`http://localhost:8888${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

suite('scan functions', () => {
  let card: (req: Request) => Promise<Response>
  let receipt: (req: Request) => Promise<Response>
  const ids: string[] = []

  async function person(label: string, plan: PlanId): Promise<SessionUser> {
    const id = `scantest-${RUN}-${label}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, 'T', `scantest.${RUN}.${label}@example.com`])
    ids.push(id)
    return { id, email: `scantest.${RUN}.${label}@example.com`, plan, planSource: 'default', isOwner: false, profile }
  }

  beforeAll(async () => {
    process.env.GROQ_API_KEY = 'test-key'
    card = (await import('../functions/scan-card.ts')).default
    receipt = (await import('../functions/scan-receipt.ts')).default
  })
  afterAll(async () => {
    for (const id of ids) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })
  beforeEach(() => {
    hoisted.replies = []
    hoisted.calls = 0
  })

  it('is part of the Pro plan and needs a sign-in, and never reaches the AI otherwise', async () => {
    hoisted.current = await person('basic', 'basic')
    expect((await card(post('/api/scan-card', { image: PNG }))).status).toBe(402)
    hoisted.current = null
    expect((await receipt(post('/api/scan-receipt', { image: PNG }))).status).toBe(401)
    expect(hoisted.calls).toBe(0)
  })

  it('refuses something that is not a small image', async () => {
    hoisted.current = await person('bad', 'pro')
    expect((await card(post('/api/scan-card', { image: 'not an image' }))).status).toBe(400)
    expect((await card(post('/api/scan-card', {}))).status).toBe(400)
    expect(hoisted.calls).toBe(0)
  })

  it('reads a card', async () => {
    hoisted.current = await person('card', 'pro')
    hoisted.replies = [ok({ name: 'Sipho Dlamini', company: 'Dlamini Electrical', role: 'Owner', phone: '082 555 0101', email: 'sipho@example.com' })]
    const response = await card(post('/api/scan-card', { image: PNG }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ card: { name: 'Sipho Dlamini', company: 'Dlamini Electrical', role: 'Owner', phone: '082 555 0101', email: 'sipho@example.com' } })
  })

  it('reads a receipt into cents', async () => {
    hoisted.current = await person('receipt', 'pro')
    hoisted.replies = [ok({ supplier: 'Builders Warehouse', date: '2026-11-18', total: 1249.9, vat: 163.03 })]
    expect(await (await receipt(post('/api/scan-receipt', { image: PNG }))).json()).toEqual({ receipt: { supplier: 'Builders Warehouse', date: '2026-11-18', totalCents: 124_990, vatCents: 16_303 } })
  })

  it('asks the model again once when its first reply is not usable', async () => {
    hoisted.current = await person('retry', 'pro')
    hoisted.replies = [{ ok: true, content: 'I think it says Spar', toolCalls: [] }, ok({ supplier: 'Spar', date: '', total: 10, vat: null })]
    const response = await receipt(post('/api/scan-receipt', { image: PNG }))
    expect(response.status).toBe(200)
    expect(hoisted.calls).toBe(2)
  })

  it('says the AI service is busy when it is, and gives up kindly when it keeps failing', async () => {
    hoisted.current = await person('busy', 'pro')
    hoisted.replies = [{ ok: false, status: 429 }]
    expect((await card(post('/api/scan-card', { image: PNG }))).status).toBe(429)
    hoisted.replies = [{ ok: true, content: 'nope', toolCalls: [] }, { ok: true, content: 'still nope', toolCalls: [] }]
    const failed = await card(post('/api/scan-card', { image: PNG }))
    expect(failed.status).toBe(502)
    expect(((await failed.json()) as { error: string }).error).toContain('clearer')
  })
})
