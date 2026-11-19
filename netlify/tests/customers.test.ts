import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CustomerStory, CustomerSummary } from '../../src/types/business.ts'
import type { PlanId } from '../../src/types/plans.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** The customer story against the real database: a person's messages, meetings and invoices gathered by name, number or email. */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const profile = { name: 'T', businessName: '', role: '', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }
const get = (path: string) => new Request(`http://localhost:8888${path}`)

suite('customers', () => {
  let customers: (req: Request) => Promise<Response>
  let pro: SessionUser
  let other: SessionUser
  let naidooId = ''
  const ids: string[] = []

  async function person(label: string, plan: PlanId): Promise<SessionUser> {
    const id = `custtest-${RUN}-${label}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, 'Test', `custtest.${RUN}.${label}@example.com`])
    ids.push(id)
    return { id, email: `custtest.${RUN}.${label}@example.com`, plan, planSource: 'default', isOwner: false, profile }
  }

  beforeAll(async () => {
    customers = (await import('../functions/customers.ts')).default
    const { saveContact } = await import('../functions/_lib/memory-store.ts')
    const { encryptDraftText } = await import('../functions/_lib/draft-store.ts')
    const { addAgendaItem } = await import('../functions/_lib/agenda.ts')
    const { createInvoice, getSettings, patchInvoice } = await import('../functions/_lib/business-store.ts')
    pro = await person('pro', 'pro')
    other = await person('other', 'pro')

    const naidoo = await saveContact(pro.id, { name: 'Mrs Naidoo', email: '', phone: '082 123 4567', relationship: 'customer', notes: 'Prefers WhatsApp' }, { cap: null })
    if (!naidoo.ok) throw new Error(naidoo.message)
    naidooId = naidoo.value.contact.id
    await saveContact(pro.id, { name: 'Pieter Botha', email: '', phone: '', relationship: '', notes: '' }, { cap: null })

    const text = encryptDraftText(pro.id, { recipient: 'Mrs Naidoo', subject: 'Geyser quote', body: 'Hi Mrs Naidoo, the geyser comes to R6 957.50.', transcript: '' })
    await sql?.query(`INSERT INTO drafts (user_id, category, recipient, subject, body, transcript, language, sent_at) VALUES ($1, 'QUOTE', $2, $3, $4, $5, 'en', now())`, [pro.id, text.recipient, text.subject, text.body, text.transcript])
    const stranger = encryptDraftText(pro.id, { recipient: 'Someone Else', subject: 'Other job', body: 'Nothing to do with her.', transcript: '' })
    await sql?.query(`INSERT INTO drafts (user_id, category, recipient, subject, body, transcript, language) VALUES ($1, 'EMAIL', $2, $3, $4, $5, 'en')`, [pro.id, stranger.recipient, stranger.subject, stranger.body, stranger.transcript])
    await addAgendaItem(pro.id, { title: 'Fit geyser at Mrs Naidoo', startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: null, notes: '' })

    const made = await createInvoice(pro.id, { customerName: 'Naidoo household', customerPhone: '+27 82 123 4567', customerEmail: '', contactId: null, items: [{ description: 'Geyser', quantity: 1, unitCents: 480_000 }], vatRate: 15, note: '' }, await getSettings(pro.id), '2026-11-19')
    if (!made.ok) throw new Error(made.message)
    await patchInvoice(pro.id, made.invoice.id, { status: 'SENT' })
  })
  afterAll(async () => {
    for (const id of ids) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })

  it('is part of the Pro plan', async () => {
    hoisted.current = { ...pro, plan: 'basic' }
    expect((await customers(get('/api/customers'))).status).toBe(402)
    hoisted.current = null
    expect((await customers(get('/api/customers'))).status).toBe(401)
  })

  it('lists the people who owe money first, with what they owe', async () => {
    hoisted.current = pro
    const { customers: list } = (await (await customers(get('/api/customers'))).json()) as { customers: CustomerSummary[] }
    expect(list.map((c) => c.name)).toEqual(['Mrs Naidoo', 'Pieter Botha'])
    expect(list[0].owedCents).toBe(552_000)
    expect(list[1].owedCents).toBe(0)
  })

  it('gathers the quote, the meeting and the invoice into one story, and leaves other people out', async () => {
    hoisted.current = pro
    const story = (await (await customers(get(`/api/customers/${naidooId}`))).json()) as CustomerStory
    expect(story.notes).toBe('Prefers WhatsApp')
    expect(story.timeline.map((entry) => entry.kind).sort()).toEqual(['agenda', 'draft', 'invoice'])
    expect(story.timeline.find((entry) => entry.kind === 'invoice')?.title).toBe('INV-0001, R5 520.00')
    expect(JSON.stringify(story)).not.toContain('Someone Else')
  })

  it("will not show one person's customer to another", async () => {
    hoisted.current = other
    expect((await customers(get(`/api/customers/${naidooId}`))).status).toBe(404)
    expect(((await (await customers(get('/api/customers'))).json()) as { customers: unknown[] }).customers).toEqual([])
  })
})
