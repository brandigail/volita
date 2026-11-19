import type { Config } from '@netlify/functions'
import { findSensitive } from '../../src/lib/sensitive.ts'
import { bookingRequestSchema, type PublicBookingPage } from '../../src/types/booking.ts'
import { addAgendaItem, deleteAgendaItem } from './_lib/agenda.ts'
import { generateSlots } from './_lib/booking-slots.ts'
import { busyBetween, createBooking, getPublicPage, rulesOf } from './_lib/booking-store.ts'
import { errorResponse, json } from './_lib/http.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { describeError } from './_lib/safe-log.ts'
import { addDays } from './_lib/time.ts'

/** A page can hold this many future bookings at once, so a flood of fake ones cannot fill the agenda. */
const MAX_FUTURE_BOOKINGS = 200

/**
 * The booking link. It is public: no sign-in. GET /api/book/:slug lists the free times; POST /api/book/:slug books one. The owner's own
 * agenda and bookings decide which times are free, and the database refuses two bookings for one time.
 */
export default async function handler(req: Request): Promise<Response> {
  const slug = new URL(req.url).pathname.split('/').filter(Boolean)[2]?.toLowerCase()
  if (!slug) return errorResponse(404, 'That booking page was not found.')

  try {
    const found = await getPublicPage(slug)
    if (!found) return errorResponse(404, 'That booking page is not available.')
    const { ownerId, page } = found
    const now = new Date()
    const rules = rulesOf(page)
    const horizon = addDays(now, page.daysAhead + 2)
    const free = () => busyBetween(ownerId, now, horizon).then((busy) => generateSlots(rules, now, busy))

    if (req.method === 'GET') {
      return json<PublicBookingPage>({ title: page.title, intro: page.intro, slotMinutes: page.slotMinutes, timeZone: page.timeZone, days: await free() }, 200)
    }
    if (req.method !== 'POST') return errorResponse(405, 'Method not allowed.')

    const parsed = bookingRequestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return errorResponse(400, 'Please give your name and the time you want.')
    const request = { ...parsed.data, start: new Date(parsed.data.start).toISOString() }
    if (request.website !== '') return errorResponse(400, 'That could not be booked.')
    if (request.phone.replace(/\D/g, '').length < 7 && !/^\S+@\S+\.\S+$/.test(request.email)) return errorResponse(400, 'Please give a phone number or an email so they can reach you.')
    if (findSensitive(`${request.name} ${request.note}`).length > 0) return errorResponse(400, 'Please leave card, bank and password details out of your booking.')

    const quota = await claimQuota({ id: ownerId, plan: 'free' }, 'booking')
    if (!quota.ok) return errorResponse(429, 'This page is getting a lot of bookings right now. Please try again in a few minutes.')

    if (!(await free()).some((day) => day.slots.includes(request.start))) return errorResponse(409, 'That time was just taken. Please pick another.')

    const endsAt = new Date(new Date(request.start).getTime() + page.slotMinutes * 60_000)
    const agenda = await addAgendaItem(ownerId, {
      title: `Booking: ${request.name}`,
      startsAt: request.start,
      endsAt: endsAt.toISOString(),
      notes: [request.phone, request.email, request.note].filter(Boolean).join(' · '),
    })
    const created = await createBooking(ownerId, request, endsAt, agenda.ok ? agenda.item.id : null, MAX_FUTURE_BOOKINGS)
    if (!created.ok) {
      if (agenda.ok) await deleteAgendaItem(ownerId, agenda.item.id)
      return created.reason === 'taken' ? errorResponse(409, 'That time was just taken. Please pick another.') : errorResponse(429, 'This page is fully booked for now.')
    }
    const { booking } = created
    return Response.json({ booked: true, startsAt: booking.startsAt, endsAt: booking.endsAt, title: page.title }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('Booking request failed:', describeError(err))
    return errorResponse(500, 'Could not reach the booking page. Please try again.')
  }
}

export const config: Config = { path: '/api/book/*' }
