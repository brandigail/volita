import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PlanId } from '../../src/types/plans.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** Importing contacts against the real database: one statement, no repeats, only the room the plan has, stored scrambled. */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const profile = { name: 'T', businessName: '', role: '', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }
const post = (body: unknown) => new Request('http://localhost:8888/api/contacts-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

suite('contacts import', () => {
  let handler: (req: Request) => Promise<Response>
  let list: typeof import('../functions/_lib/memory-store.ts').listContacts
  const ids: string[] = []

  async function person(label: string, plan: PlanId): Promise<SessionUser> {
    const id = `imptest-${RUN}-${label}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, 'T', `imptest.${RUN}.${label}@example.com`])
    ids.push(id)
    return { id, email: `imptest.${RUN}.${label}@example.com`, plan, planSource: 'default', isOwner: false, profile }
  }

  beforeAll(async () => {
    handler = (await import('../functions/contacts-import.ts')).default
    list = (await import('../functions/_lib/memory-store.ts')).listContacts
  })
  afterAll(async () => {
    for (const id of ids) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })

  it('is part of the Basic plan and needs a sign-in', async () => {
    hoisted.current = await person('free', 'free')
    expect((await handler(post({ contacts: [{ name: 'A', phone: '0821111111' }] }))).status).toBe(402)
    hoisted.current = null
    expect((await handler(post({ contacts: [{ name: 'A', phone: '0821111111' }] }))).status).toBe(401)
  })

  it('saves the contacts scrambled, and a second import of the same file adds nothing', async () => {
    const pro = await person('pro', 'pro')
    hoisted.current = pro
    const file = [
      { name: 'Mrs Naidoo', phone: '+27821234567', email: 'n@example.com' },
      { name: 'Pieter Botha', phone: '+27839990000', email: '' },
    ]
    expect(await (await handler(post({ contacts: file }))).json()).toEqual({ added: 2, skippedExisting: 0, skippedNoRoom: 0 })
    expect((await list(pro.id)).map((contact) => contact.name).sort()).toEqual(['Mrs Naidoo', 'Pieter Botha'])
    const [row] = (await sql?.query('SELECT name, phone FROM contacts WHERE user_id = $1 LIMIT 1', [pro.id])) as { name: string; phone: string }[]
    expect(row.name.startsWith('enc1:') && row.phone.startsWith('enc1:')).toBe(true)
    expect(await (await handler(post({ contacts: file }))).json()).toEqual({ added: 0, skippedExisting: 2, skippedNoRoom: 0 })
    expect(await list(pro.id)).toHaveLength(2)
  })

  it('skips someone saved under another spelling of the same number', async () => {
    const pro = { ...(await person('pro2', 'pro')) }
    hoisted.current = pro
    await handler(post({ contacts: [{ name: 'Sam', phone: '082 123 4567' }] }))
    expect(await (await handler(post({ contacts: [{ name: 'Samuel Dube', phone: '+27 82 123 4567' }] }))).json()).toMatchObject({ added: 0, skippedExisting: 1 })
  })

  it('only uses the room the plan has: Basic keeps 25 people', async () => {
    const basic = await person('basic', 'basic')
    hoisted.current = basic
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Customer ${i}`, phone: `082 000 ${String(1000 + i)}` }))
    expect(await (await handler(post({ contacts: many }))).json()).toEqual({ added: 25, skippedExisting: 0, skippedNoRoom: 5 })
    expect(await list(basic.id)).toHaveLength(25)
  })

  it('refuses a file with no names, too many contacts, and card details', async () => {
    hoisted.current = await person('bad', 'pro')
    expect((await handler(post({ contacts: [] }))).status).toBe(400)
    expect((await handler(post({ contacts: [{ name: '', phone: '0821111111' }] }))).status).toBe(400)
    expect((await handler(post({ contacts: Array.from({ length: 501 }, (_, i) => ({ name: `P${i}`, phone: '0821111111' })) }))).status).toBe(400)
    // The safety check refuses with 422, the same as for a contact added by hand.
    expect((await handler(post({ contacts: [{ name: 'My card is 4111 1111 1111 1111', phone: '' }] }))).status).toBe(422)
  })
})
