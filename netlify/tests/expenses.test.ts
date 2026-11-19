import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PlanId } from '../../src/types/plans.ts'
import type { Expense } from '../../src/types/scan.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** Expenses against the real database: saved, listed newest first, scrambled, private to each person, Pro only. */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const profile = { name: 'T', businessName: '', role: '', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }
const call = (method: string, path = '/api/expenses', body?: unknown) => new Request(`http://localhost:8888${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

suite('expenses', () => {
  let handler: (req: Request) => Promise<Response>
  let pro: SessionUser
  const ids: string[] = []

  async function person(label: string, plan: PlanId): Promise<SessionUser> {
    const id = `exptest-${RUN}-${label}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, 'T', `exptest.${RUN}.${label}@example.com`])
    ids.push(id)
    return { id, email: `exptest.${RUN}.${label}@example.com`, plan, planSource: 'default', isOwner: false, profile }
  }

  beforeAll(async () => {
    handler = (await import('../functions/expenses.ts')).default
    pro = await person('pro', 'pro')
  })
  afterAll(async () => {
    for (const id of ids) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })

  it('is part of the Pro plan and needs a sign-in', async () => {
    hoisted.current = { ...pro, plan: 'basic' }
    expect((await handler(call('GET'))).status).toBe(402)
    hoisted.current = null
    expect((await handler(call('GET'))).status).toBe(401)
  })

  it('saves an expense, lists newest first, and keeps who and what scrambled', async () => {
    hoisted.current = pro
    const older = await handler(call('POST', '/api/expenses', { spentOn: '2026-11-03', supplier: 'Builders Warehouse', totalCents: 124_990, vatCents: 16_303, note: 'Copper pipe' }))
    expect(older.status).toBe(201)
    await handler(call('POST', '/api/expenses', { spentOn: '2026-11-18', supplier: 'Spar', totalCents: 24_550 }))
    const { expenses } = (await (await handler(call('GET'))).json()) as { expenses: Expense[] }
    expect(expenses.map((expense) => expense.supplier)).toEqual(['Spar', 'Builders Warehouse'])
    expect(expenses[1]).toMatchObject({ spentOn: '2026-11-03', totalCents: 124_990, vatCents: 16_303, note: 'Copper pipe' })
    const [row] = (await sql?.query('SELECT supplier, note FROM expenses WHERE user_id = $1 AND total_cents = 124990', [pro.id])) as { supplier: string; note: string }[]
    expect(row.supplier.startsWith('enc1:') && row.note.startsWith('enc1:')).toBe(true)
  })

  it('refuses nonsense: no supplier, a zero total, VAT above the total, a bad date', async () => {
    hoisted.current = pro
    const bad = (body: unknown) => handler(call('POST', '/api/expenses', body))
    expect((await bad({ spentOn: '2026-11-18', supplier: '', totalCents: 100 })).status).toBe(400)
    expect((await bad({ spentOn: '2026-11-18', supplier: 'X', totalCents: 0 })).status).toBe(400)
    expect((await bad({ spentOn: 'yesterday', supplier: 'X', totalCents: 100 })).status).toBe(400)
    expect((await bad({ spentOn: '2026-11-18', supplier: 'X', totalCents: 100, vatCents: 500 })).status).toBe(409)
  })

  it("deletes one's own expense and cannot touch anyone else's", async () => {
    hoisted.current = pro
    const { expenses } = (await (await handler(call('GET'))).json()) as { expenses: Expense[] }
    hoisted.current = await person('other', 'pro')
    expect((await handler(call('DELETE', `/api/expenses/${expenses[0].id}`))).status).toBe(404)
    expect(((await (await handler(call('GET'))).json()) as { expenses: Expense[] }).expenses).toEqual([])
    hoisted.current = pro
    expect((await handler(call('DELETE', `/api/expenses/${expenses[0].id}`))).status).toBe(200)
  })
})
