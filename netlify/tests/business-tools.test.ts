import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Invoice } from '../../src/types/business.ts'
import type { PlanId } from '../../src/types/plans.ts'
import type { ToolContext } from '../functions/_lib/assistant-tools.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** The assistant's money tools against the real database with a throwaway person. No AI is involved: reminders are fixed wording. */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const profile = { name: 'Sam Dube', businessName: 'Dube Plumbing', role: '', phone: '', signature: 'Sam', calendarUrl: '', nickname: '', businessAbout: '' }

suite('business tools', () => {
  let tools: typeof import('../functions/_lib/business-tools.ts')
  let store: typeof import('../functions/_lib/business-store.ts')
  let sync: (req: Request) => Promise<Response>
  let userId = ''
  const ids: string[] = []

  const context = (plan: PlanId = 'pro'): ToolContext => ({
    userId,
    plan,
    profile,
    timeZone: 'Africa/Johannesburg',
    apiKey: 'unused',
    deadlineAt: Date.now() + 9_000,
    actions: [],
    emailRead: false,
    userText: '',
    chats: [],
    driving: false,
    inboxTitles: [],
  })
  const run = async (name: string, args: unknown, ctx = context()) => JSON.parse((await tools.runBusinessTool(name, args, ctx)) ?? 'null') as Record<string, unknown>

  /** Makes a sent invoice that was due `daysAgo` days ago. */
  async function sentInvoice(customer: string, phone: string, daysAgo: number): Promise<Invoice> {
    const made = await store.createInvoice(userId, { customerName: customer, customerPhone: phone, customerEmail: '', contactId: null, items: [{ description: 'Geyser', quantity: 1, unitCents: 480_000 }], vatRate: 15, note: '' }, await store.getSettings(userId), '2026-01-01')
    if (!made.ok) throw new Error(made.message)
    await store.patchInvoice(userId, made.invoice.id, { status: 'SENT' })
    await sql?.query("UPDATE invoices SET due_on = current_date - $2::int WHERE id = $1", [made.invoice.id, daysAgo])
    return (await store.getInvoice(userId, made.invoice.id)) as Invoice
  }

  beforeAll(async () => {
    tools = await import('../functions/_lib/business-tools.ts')
    store = await import('../functions/_lib/business-store.ts')
    sync = (await import('../functions/db-sync.ts')).default
    userId = `bizttest-${RUN}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [userId, 'Sam', `bizttest.${RUN}@example.com`])
    ids.push(userId)
    hoisted.current = { id: userId, email: `bizttest.${RUN}@example.com`, plan: 'pro', planSource: 'default', isOwner: false, profile }
  })
  afterAll(async () => {
    for (const id of ids) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })

  it('is part of the Pro plan', async () => {
    expect(await run('money_owed', {}, context('basic'))).toMatchObject({ error: expect.stringContaining('Pro plan') })
  })

  it('shows the money tools only on turns about money or customers', () => {
    expect(tools.wantsBusinessTools('Who owes me money?')).toBe(true)
    expect(tools.wantsBusinessTools('Invoice Mrs Naidoo for the geyser')).toBe(true)
    expect(tools.wantsBusinessTools("What's on my agenda tomorrow?")).toBe(false)
  })

  it('makes an invoice as a draft with the price in rand, adds VAT on request, and records what it did', async () => {
    const ctx = context()
    const result = await run('create_invoice', { customer: 'Mrs Naidoo', items: [{ description: 'Geyser', price: 4800 }, { description: 'Labour', quantity: 2, price: 450 }], vat: true }, ctx)
    expect(result).toMatchObject({ made: true, number: 'INV-0001', total: 'R6 555.00', vatIncluded: true })
    expect(ctx.actions).toEqual([{ type: 'invoice_ready', id: expect.any(String), label: 'INV-0001 for Mrs Naidoo, R6 555.00' }])
    expect(((await store.listInvoices(userId))[0] as Invoice).status).toBe('DRAFT')
  })

  it('will not chase an invoice that is not overdue, and says so', async () => {
    const fresh = await sentInvoice('Pieter Botha', '', -5)
    expect(await run('chase_payment', { invoice: fresh.number })).toMatchObject({ reminded: false, note: expect.stringContaining('not overdue') })
  })

  it('writes the first reminder for a week-late invoice, saves it for approval and counts it only once it is marked sent', async () => {
    const late = await sentInvoice('Mrs Dlamini', '082 555 0101', 8)
    const ctx = context()
    const result = await run('chase_payment', { invoice: 'Mrs Dlamini' }, ctx)
    expect(result).toMatchObject({ prepared: true, reminder: 1, knowsNumber: true })
    expect(ctx.actions).toEqual([{ type: 'reply_ready', id: expect.any(String), label: 'WhatsApp to Mrs Dlamini' }])
    expect(ctx.directReply).toContain('friendly reminder')
    expect(ctx.directReply).not.toMatch(/Sam$/)

    const draftId = (ctx.actions[0] as { id: string }).id
    const [stored] = (await sql?.query('SELECT category, recipient, transcript FROM drafts WHERE id = $1', [draftId])) as { category: string; recipient: string; transcript: string }[]
    expect(stored.category).toBe('WHATSAPP')
    expect(stored.recipient.startsWith('enc1:')).toBe(true)
    expect((await store.getInvoice(userId, late.id))?.remindersSent).toBe(0)

    // Marking it sent (the spoken "send it" does this) counts it, and marking it sent twice counts it once.
    const mark = () => sync(new Request(`http://localhost:8888/api/drafts/${draftId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sent: true }) }))
    expect((await mark()).status).toBe(200)
    expect((await mark()).status).toBe(200)
    expect((await store.getInvoice(userId, late.id))?.remindersSent).toBe(1)
    expect(await run('chase_payment', { invoice: late.number })).toMatchObject({ reminded: false, note: expect.stringContaining('Too soon') })
  })

  it('lists who owes what, most overdue first', async () => {
    const result = (await run('money_owed', {})) as { totalOwed: string; overdue: { customer: string; daysOverdue: number }[] }
    expect(result.overdue.map((item) => item.customer)).toEqual(['Mrs Dlamini'])
    expect(result.overdue[0].daysOverdue).toBe(8)
    expect(result.totalOwed).toMatch(/^R/)
  })

  it('marks a customer’s only sent invoice as paid by name, and asks which when two match', async () => {
    const ctx = context()
    expect(await run('mark_invoice_paid', { invoice: 'Mrs Dlamini' }, ctx)).toMatchObject({ paid: true, customer: 'Mrs Dlamini' })
    expect(ctx.actions[0]).toMatchObject({ type: 'invoice_paid' })
    await sentInvoice('Twin Customer', '', 1)
    await sentInvoice('Twin Customer', '', 2)
    expect(await run('mark_invoice_paid', { invoice: 'Twin Customer' })).toMatchObject({ error: expect.stringContaining('More than one') })
  })

  it('asks for a review only once a review link is saved, and never sends it itself', async () => {
    expect(await run('ask_for_review', { customer: 'Mrs Dlamini' })).toMatchObject({ error: expect.stringContaining('review link') })
    await store.saveSettings(userId, { ...(await store.getSettings(userId)), reviewLink: 'https://g.page/r/abc/review' })
    const ctx = context()
    expect(await run('ask_for_review', { customer: 'Mrs Dlamini' }, ctx)).toMatchObject({ prepared: true, knowsNumber: true })
    expect(ctx.actions[0]).toMatchObject({ type: 'reply_ready', label: 'WhatsApp to Mrs Dlamini' })
    const [row] = (await sql?.query('SELECT sent_at FROM drafts WHERE id = $1', [(ctx.actions[0] as { id: string }).id])) as { sent_at: string | null }[]
    expect(row.sent_at).toBeNull()
  })

  it('tells the story of a customer from the books, and says so when nothing is known', async () => {
    expect(await run('customer_story', { name: 'Mrs Dlamini' })).toMatchObject({ customer: 'Mrs Dlamini', recent: expect.any(Array) })
    expect(await run('customer_story', { name: 'Nobody Atall' })).toMatchObject({ error: expect.stringContaining('Nothing is saved') })
  })
})
