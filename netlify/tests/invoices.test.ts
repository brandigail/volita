import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessSettings, Invoice, InvoicesResponse } from '../../src/types/business.ts'
import type { PlanId } from '../../src/types/plans.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** Invoices and business details against the real database with throwaway people: numbering, VAT, status moves, plan lock. */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const profile = { name: 'T', businessName: '', role: '', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }
const call = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost:8888${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

const geyser = {
  customerName: 'Mrs Naidoo',
  customerPhone: '082 123 4567',
  items: [
    { description: 'Geyser', quantity: 1, unitCents: 480_000 },
    { description: 'Labour', quantity: 2, unitCents: 45_000 },
  ],
  vatRate: 15,
}

suite('invoices', () => {
  let invoices: (req: Request) => Promise<Response>
  let business: (req: Request) => Promise<Response>
  let pro: SessionUser
  let basic: SessionUser
  const ids: string[] = []

  async function person(label: string, plan: PlanId): Promise<SessionUser> {
    const id = `invtest-${RUN}-${label}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, 'Test', `invtest.${RUN}.${label}@example.com`])
    ids.push(id)
    return { id, email: `invtest.${RUN}.${label}@example.com`, plan, planSource: 'default', isOwner: false, profile }
  }
  const create = async (body: unknown = geyser) => (await (await invoices(call('POST', '/api/invoices', body))).json()) as Invoice

  beforeAll(async () => {
    invoices = (await import('../functions/invoices.ts')).default
    business = (await import('../functions/business.ts')).default
    pro = await person('pro', 'pro')
    basic = await person('basic', 'basic')
  })
  afterAll(async () => {
    for (const id of ids) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })
  beforeEach(() => {
    hoisted.current = pro
  })

  it('is part of the Pro plan: Basic is asked to upgrade, signed-out people are refused', async () => {
    hoisted.current = basic
    const refused = await invoices(call('GET', '/api/invoices'))
    expect(refused.status).toBe(402)
    expect(await refused.json()).toMatchObject({ upgrade: 'pro' })
    expect((await business(call('GET', '/api/business'))).status).toBe(402)
    hoisted.current = null
    expect((await invoices(call('GET', '/api/invoices'))).status).toBe(401)
  })

  it('adds 15% VAT on top, numbers invoices 1, 2, 3 and sets the due date from the payment terms', async () => {
    const first = await create({ ...geyser, issuedOn: '2026-11-19' })
    expect(first).toMatchObject({ number: 'INV-0001', status: 'DRAFT', subtotalCents: 570_000, vatCents: 85_500, totalCents: 655_500, issuedOn: '2026-11-19', dueOn: '2026-11-26' })
    expect((await create()).number).toBe('INV-0002')
    expect((await create()).number).toBe('INV-0003')
  })

  it('refuses an invoice with no items or a negative price', async () => {
    expect((await invoices(call('POST', '/api/invoices', { ...geyser, items: [] }))).status).toBe(400)
    expect((await invoices(call('POST', '/api/invoices', { ...geyser, items: [{ description: 'x', quantity: 1, unitCents: -5 }] }))).status).toBe(400)
  })

  it('stores customer details scrambled, not as plain text', async () => {
    const made = await create({ ...geyser, customerName: 'Zanele Plain-Text-Check' })
    const [row] = (await sql?.query('SELECT customer_name, items FROM invoices WHERE id = $1', [made.id])) as { customer_name: string; items: string }[]
    expect(row.customer_name.startsWith('enc1:')).toBe(true)
    expect(row.items.startsWith('enc1:')).toBe(true)
  })

  it('moves a draft to sent to paid, and never reopens a paid invoice', async () => {
    const made = await create()
    const patch = (body: unknown) => invoices(call('PATCH', `/api/invoices/${made.id}`, body))
    expect(((await (await patch({ status: 'SENT' })).json()) as Invoice).status).toBe('SENT')
    const paid = (await (await patch({ status: 'PAID' })).json()) as Invoice
    expect(paid.status).toBe('PAID')
    expect(paid.paidAt).not.toBeNull()
    expect(paid).toMatchObject({ customerPhone: '082 123 4567', vatRate: 15 })
    expect((await patch({ status: 'SENT' })).status).toBe(409)
  })

  it('lets a draft be edited, but a sent invoice keeps the words the customer was told', async () => {
    const made = await create()
    const edit = (body: unknown) => invoices(call('PATCH', `/api/invoices/${made.id}`, body))
    const edited = (await (await edit({ items: [{ description: 'Tap', quantity: 3, unitCents: 10_000 }], vatRate: 0 })).json()) as Invoice
    expect(edited).toMatchObject({ subtotalCents: 30_000, vatCents: 0, totalCents: 30_000 })
    await edit({ status: 'SENT' })
    expect((await edit({ note: 'changed after sending' })).status).toBe(409)
  })

  it('deletes a draft but not a sent invoice', async () => {
    const draft = await create()
    expect((await invoices(call('DELETE', `/api/invoices/${draft.id}`))).status).toBe(200)
    const sent = await create()
    await invoices(call('PATCH', `/api/invoices/${sent.id}`, { status: 'SENT' }))
    expect((await invoices(call('DELETE', `/api/invoices/${sent.id}`))).status).toBe(409)
  })

  it("keeps one person's invoices away from another", async () => {
    const mine = await create()
    hoisted.current = { ...basic, plan: 'pro' }
    expect((await invoices(call('GET', `/api/invoices/${mine.id}`))).status).toBe(404)
    expect(((await (await invoices(call('GET', '/api/invoices'))).json()) as InvoicesResponse).invoices).toEqual([])
  })

  it('saves the business details, keeps the bank account scrambled, and refuses a review link that is not https', async () => {
    const details: BusinessSettings = { vatRegistered: true, vatNumber: '4123456789', bankDetails: 'FNB, 62000000000, branch 250655', paymentTermsDays: 14, invoiceNote: 'Thank you!', reviewLink: 'https://g.page/r/example' }
    expect((await business(call('PUT', '/api/business', details))).status).toBe(200)
    expect(await (await business(call('GET', '/api/business'))).json()).toEqual(details)
    const [row] = (await sql?.query('SELECT bank_details, vat_number FROM business_settings WHERE user_id = $1', [pro.id])) as { bank_details: string; vat_number: string }[]
    expect(row.bank_details.startsWith('enc1:') && row.vat_number.startsWith('enc1:')).toBe(true)
    expect((await business(call('PUT', '/api/business', { ...details, reviewLink: 'http://insecure.example' }))).status).toBe(400)
    const next = await create({ ...geyser, issuedOn: '2026-11-19' })
    expect(next.dueOn).toBe('2026-12-03')
  })
})
