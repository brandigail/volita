import { neon } from '@neondatabase/serverless'
import { randomBytes } from 'node:crypto'
import { bookingHoursSchema, type Booking, type BookingPage, type BookingRequest } from '../../../src/types/booking.ts'
import { planLimits } from '../../../src/types/plans.ts'
import { encryptText, openText } from './crypto.ts'
import { resolvePlan } from './plan.ts'
import type { Busy, SlotRules } from './booking-slots.ts'

const sql = () => neon(process.env.DATABASE_URL ?? '')
const iso = (value: string | Date) => new Date(value).toISOString()
const UNIQUE_VIOLATION = '23505'
const isUnique = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION
/** An agenda item with no end time is treated as taking this long. */
const DEFAULT_MEETING_MINUTES = 60

interface PageRow {
  user_id: string
  slug: string
  enabled: boolean
  title: string
  intro: string
  slot_minutes: number
  days_ahead: number
  min_notice_hours: number
  hours: string
  time_zone: string
}

const toPage = (row: PageRow): BookingPage => {
  const hours = bookingHoursSchema.safeParse(JSON.parse(row.hours))
  return {
    slug: row.slug,
    enabled: row.enabled,
    title: row.title,
    intro: row.intro,
    slotMinutes: row.slot_minutes,
    daysAhead: row.days_ahead,
    minNoticeHours: row.min_notice_hours,
    hours: hours.success ? hours.data : {},
    timeZone: row.time_zone,
  }
}

const PAGE_COLUMNS = 'user_id, slug, enabled, title, intro, slot_minutes, days_ahead, min_notice_hours, hours, time_zone'

export async function getPage(userId: string): Promise<BookingPage | null> {
  const [row] = (await sql().query(`SELECT ${PAGE_COLUMNS} FROM booking_pages WHERE user_id = $1`, [userId])) as PageRow[]
  return row ? toPage(row) : null
}

/** The page a customer opened, with who owns it. Only a page its owner has switched on, and whose owner is still on Pro, counts. */
export async function getPublicPage(slug: string): Promise<{ ownerId: string; page: BookingPage } | null> {
  const [row] = (await sql().query(`SELECT ${PAGE_COLUMNS} FROM booking_pages WHERE slug = $1 AND enabled`, [slug])) as PageRow[]
  if (!row) return null
  const [owner] = (await sql().query('SELECT email FROM "user" WHERE id = $1', [row.user_id])) as { email: string }[]
  if (!owner) return null
  const { plan } = await resolvePlan(row.user_id, owner.email)
  return planLimits(plan).business ? { ownerId: row.user_id, page: toPage(row) } : null
}

/** A first draft of the owner's page, not saved until they press save: an address made from the business name, weekdays 08:00 to 17:00. */
export function defaultPage(businessName: string, timeZone: string): BookingPage {
  const base = businessName.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
  const weekday = { start: '08:00', end: '17:00' }
  return {
    slug: `${base.length >= 3 ? base : 'book'}-${randomBytes(2).toString('hex')}`,
    enabled: false,
    title: businessName,
    intro: '',
    slotMinutes: 60,
    daysAhead: 14,
    minNoticeHours: 12,
    hours: { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday },
    timeZone,
  }
}

export async function savePage(userId: string, page: BookingPage): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await sql().query(
      `INSERT INTO booking_pages (user_id, slug, enabled, title, intro, slot_minutes, days_ahead, min_notice_hours, hours, time_zone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id) DO UPDATE SET slug = $2, enabled = $3, title = $4, intro = $5, slot_minutes = $6, days_ahead = $7,
         min_notice_hours = $8, hours = $9, time_zone = $10, updated_at = now()`,
      [userId, page.slug, page.enabled, page.title, page.intro, page.slotMinutes, page.daysAhead, page.minNoticeHours, JSON.stringify(page.hours), page.timeZone],
    )
    return { ok: true }
  } catch (err) {
    if (isUnique(err)) return { ok: false, message: 'That address is already taken. Choose another.' }
    throw err
  }
}

export const rulesOf = (page: BookingPage): SlotRules => ({ slotMinutes: page.slotMinutes, daysAhead: page.daysAhead, minNoticeHours: page.minNoticeHours, hours: page.hours, timeZone: page.timeZone })

/** Everything already taking up the owner's time between two moments: confirmed bookings and meetings on their Volita agenda. */
export async function busyBetween(userId: string, from: Date, to: Date): Promise<Busy[]> {
  const [bookings, agenda] = await Promise.all([
    sql().query("SELECT starts_at, ends_at FROM bookings WHERE user_id = $1 AND status = 'CONFIRMED' AND starts_at < $3 AND ends_at > $2", [userId, from.toISOString(), to.toISOString()]) as unknown as Promise<{ starts_at: string | Date; ends_at: string | Date }[]>,
    sql().query(
      `SELECT starts_at, COALESCE(ends_at, starts_at + make_interval(mins => ${DEFAULT_MEETING_MINUTES})) AS ends_at FROM agenda_items
       WHERE user_id = $1 AND starts_at < $3 AND COALESCE(ends_at, starts_at + make_interval(mins => ${DEFAULT_MEETING_MINUTES})) > $2`,
      [userId, from.toISOString(), to.toISOString()],
    ) as unknown as Promise<{ starts_at: string | Date; ends_at: string | Date }[]>,
  ])
  return [...bookings, ...agenda].map((row) => ({ start: new Date(row.starts_at), end: new Date(row.ends_at) }))
}

interface BookingRow {
  id: string
  starts_at: string | Date
  ends_at: string | Date
  customer_name: string
  customer_phone: string
  customer_email: string
  note: string
  status: Booking['status']
  reminded_at: string | Date | null
  agenda_item_id: string | null
}

const BOOKING_COLUMNS = 'id, starts_at, ends_at, customer_name, customer_phone, customer_email, note, status, reminded_at, agenda_item_id'

const toBooking = (userId: string, row: BookingRow): Booking => ({
  id: row.id,
  startsAt: iso(row.starts_at),
  endsAt: iso(row.ends_at),
  customerName: openText(userId, 'bookings.customer_name', row.customer_name),
  customerPhone: openText(userId, 'bookings.customer_phone', row.customer_phone),
  customerEmail: openText(userId, 'bookings.customer_email', row.customer_email),
  note: openText(userId, 'bookings.note', row.note),
  status: row.status,
  remindedAt: row.reminded_at ? iso(row.reminded_at) : null,
})

export type CreateBookingResult = { ok: true; booking: Booking } | { ok: false; reason: 'taken' | 'full' }

/** Saves a booking. The database refuses a second booking for the same start time, so two people picking the same slot at once cannot both get it. */
export async function createBooking(userId: string, request: BookingRequest, endsAt: Date, agendaItemId: string | null, maxBookings: number): Promise<CreateBookingResult> {
  const [{ total }] = (await sql().query("SELECT count(*)::int AS total FROM bookings WHERE user_id = $1 AND status = 'CONFIRMED' AND starts_at > now()", [userId])) as { total: number }[]
  if (total >= maxBookings) return { ok: false, reason: 'full' }
  try {
    const [row] = (await sql().query(
      `INSERT INTO bookings (user_id, starts_at, ends_at, customer_name, customer_phone, customer_email, note, agenda_item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${BOOKING_COLUMNS}`,
      [
        userId,
        request.start,
        endsAt.toISOString(),
        encryptText(userId, 'bookings.customer_name', request.name),
        encryptText(userId, 'bookings.customer_phone', request.phone),
        encryptText(userId, 'bookings.customer_email', request.email),
        encryptText(userId, 'bookings.note', request.note),
        agendaItemId,
      ],
    )) as BookingRow[]
    return { ok: true, booking: toBooking(userId, row) }
  } catch (err) {
    if (isUnique(err)) return { ok: false, reason: 'taken' }
    throw err
  }
}

/** Upcoming bookings and the last two weeks, soonest first. */
export async function listBookings(userId: string): Promise<Booking[]> {
  const rows = (await sql().query(`SELECT ${BOOKING_COLUMNS} FROM bookings WHERE user_id = $1 AND starts_at > now() - interval '14 days' ORDER BY starts_at LIMIT 200`, [userId])) as BookingRow[]
  return rows.map((row) => toBooking(userId, row))
}

export type PatchBookingResult = { ok: true; booking: Booking } | { ok: false }

/** Cancels a booking (freeing its slot and taking it off the agenda) or notes that the day-before reminder was sent. */
export async function patchBooking(userId: string, id: string, patch: { cancel?: boolean; reminded?: boolean }): Promise<PatchBookingResult> {
  const [row] = (await sql().query(
    `UPDATE bookings SET status = CASE WHEN $3 THEN 'CANCELLED' ELSE status END, reminded_at = CASE WHEN $4 THEN now() ELSE reminded_at END
     WHERE id = $1 AND user_id = $2 RETURNING ${BOOKING_COLUMNS}`,
    [id, userId, patch.cancel === true, patch.reminded === true],
  )) as BookingRow[]
  if (!row) return { ok: false }
  if (patch.cancel === true && row.agenda_item_id) await sql().query('DELETE FROM agenda_items WHERE id = $1 AND user_id = $2', [row.agenda_item_id, userId])
  return { ok: true, booking: toBooking(userId, row) }
}
