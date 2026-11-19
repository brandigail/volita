import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Booking, BookingPage, PublicBookingPage } from '../../src/types/booking.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** The booking link against the real database: free times, booking one, the same time refused twice, cancelling, and who may use it. */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const profile = { name: 'Sam Dube', businessName: 'Dube Plumbing', role: '', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' }
const send = (method: string, path: string, body?: unknown) => new Request(`http://localhost:8888${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

suite('bookings', () => {
  let publicPage: (req: Request) => Promise<Response>
  let settings: (req: Request) => Promise<Response>
  let owned: (req: Request) => Promise<Response>
  let ownerId = ''
  let slug = ''
  const ids: string[] = []

  const open = async (): Promise<PublicBookingPage> => (await (await publicPage(send('GET', `/api/book/${slug}`))).json()) as PublicBookingPage
  const book = (start: string, extra: Record<string, unknown> = {}) => publicPage(send('POST', `/api/book/${slug}`, { start, name: 'Mrs Naidoo', phone: '082 123 4567', note: 'Geyser is leaking', ...extra }))
  const allSlots = async () => (await open()).days.flatMap((day) => day.slots)

  beforeAll(async () => {
    publicPage = (await import('../functions/book.ts')).default
    settings = (await import('../functions/booking-page.ts')).default
    owned = (await import('../functions/bookings.ts')).default
    ownerId = `booktest-${RUN}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [ownerId, 'Sam', `booktest.${RUN}@example.com`])
    await sql?.query("INSERT INTO plan_grants (user_id, plan, note, granted_by) VALUES ($1, 'pro', 'test', 'test')", [ownerId])
    ids.push(ownerId)
    hoisted.current = { id: ownerId, email: `booktest.${RUN}@example.com`, plan: 'pro', planSource: 'grant', isOwner: false, profile }
  })
  afterAll(async () => {
    for (const id of ids) await sql?.query('DELETE FROM "user" WHERE id = $1', [id])
  })

  it('starts the owner with a first draft made from the business name, switched off', async () => {
    const { page, saved } = (await (await settings(send('GET', '/api/booking-page?tz=Africa/Johannesburg'))).json()) as { page: BookingPage; saved: boolean }
    expect(saved).toBe(false)
    expect(page.enabled).toBe(false)
    expect(page.slug).toMatch(/^dube-plumbing-[0-9a-f]{4}$/)
    slug = page.slug
    const everyDay = { start: '08:00', end: '17:00' }
    const hours = { sun: everyDay, mon: everyDay, tue: everyDay, wed: everyDay, thu: everyDay, fri: everyDay, sat: everyDay }
    expect((await settings(send('PUT', '/api/booking-page', { ...page, hours, minNoticeHours: 0, daysAhead: 7 }))).status).toBe(200)
  })

  it('shows nothing to customers until the owner switches the page on', async () => {
    expect((await publicPage(send('GET', `/api/book/${slug}`))).status).toBe(404)
    const { page } = (await (await settings(send('GET', '/api/booking-page'))).json()) as { page: BookingPage }
    expect((await settings(send('PUT', '/api/booking-page', { ...page, enabled: true }))).status).toBe(200)
    expect((await open()).days.length).toBeGreaterThan(0)
    expect((await publicPage(send('GET', '/api/book/no-such-page'))).status).toBe(404)
  })

  it('books a free time, puts it on the agenda, and keeps the customer details scrambled', async () => {
    const start = (await allSlots())[0]
    const response = await book(start)
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ booked: true, startsAt: start })
    expect(await allSlots()).not.toContain(start)
    const [row] = (await sql?.query('SELECT customer_name, customer_phone FROM bookings WHERE user_id = $1', [ownerId])) as { customer_name: string; customer_phone: string }[]
    expect(row.customer_name.startsWith('enc1:') && row.customer_phone.startsWith('enc1:')).toBe(true)
    const titles = (await sql?.query('SELECT title FROM agenda_items WHERE user_id = $1', [ownerId])) as { title: string }[]
    expect(titles).toHaveLength(1)
  })

  it('refuses the same time a second time', async () => {
    const [taken] = ((await sql?.query("SELECT starts_at FROM bookings WHERE user_id = $1 AND status = 'CONFIRMED'", [ownerId])) as { starts_at: string }[]).map((row) => new Date(row.starts_at).toISOString())
    expect((await book(taken, { name: 'Late Larry' })).status).toBe(409)
  })

  it('refuses a time that was never offered, a robot, no way to reach the customer, and card details', async () => {
    const [free] = await allSlots()
    expect((await book('2020-01-01T08:00:00.000Z')).status).toBe(409)
    expect((await book(free, { website: 'http://spam.example' })).status).toBe(400)
    expect((await book(free, { phone: '', email: '' })).status).toBe(400)
    expect((await book(free, { note: 'my card is 4111 1111 1111 1111' })).status).toBe(400)
    expect(await allSlots()).toContain(free)
  })

  it('lists the booking for its owner with the customer’s details, and cancelling frees the time and clears the agenda', async () => {
    const { bookings } = (await (await owned(send('GET', '/api/bookings'))).json()) as { bookings: Booking[] }
    expect(bookings).toHaveLength(1)
    expect(bookings[0]).toMatchObject({ customerName: 'Mrs Naidoo', customerPhone: '082 123 4567', status: 'CONFIRMED' })

    const reminded = (await (await owned(send('PATCH', `/api/bookings/${bookings[0].id}`, { reminded: true }))).json()) as Booking
    expect(reminded.remindedAt).not.toBeNull()

    const cancelled = (await (await owned(send('PATCH', `/api/bookings/${bookings[0].id}`, { status: 'CANCELLED' }))).json()) as Booking
    expect(cancelled.status).toBe('CANCELLED')
    expect(await allSlots()).toContain(bookings[0].startsAt)
    expect(await sql?.query('SELECT 1 FROM agenda_items WHERE user_id = $1', [ownerId])).toHaveLength(0)
    expect((await book(bookings[0].startsAt)).status).toBe(201)
  })

  it('shows another person nothing of the owner’s bookings', async () => {
    const [mine] = (await sql?.query('SELECT id FROM bookings WHERE user_id = $1 LIMIT 1', [ownerId])) as { id: string }[]
    hoisted.current = { id: 'someone-else', email: 'x@example.com', plan: 'pro', planSource: 'grant', isOwner: false, profile }
    expect((await owned(send('PATCH', `/api/bookings/${mine.id}`, { status: 'CANCELLED' }))).status).toBe(404)
    hoisted.current = { id: ownerId, email: `booktest.${RUN}@example.com`, plan: 'pro', planSource: 'grant', isOwner: false, profile }
  })

  it('is part of the Pro plan: the owner’s settings are locked on Basic, and the public page closes if the owner leaves Pro', async () => {
    hoisted.current = { id: ownerId, email: `booktest.${RUN}@example.com`, plan: 'basic', planSource: 'default', isOwner: false, profile }
    expect((await settings(send('GET', '/api/booking-page'))).status).toBe(402)
    expect((await owned(send('GET', '/api/bookings'))).status).toBe(402)
    await sql?.query('DELETE FROM plan_grants WHERE user_id = $1', [ownerId])
    expect((await publicPage(send('GET', `/api/book/${slug}`))).status).toBe(404)
  })
})
