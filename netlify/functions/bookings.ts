import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { bookingPatchSchema, type Booking } from '../../src/types/booking.ts'
import { planLimits } from '../../src/types/plans.ts'
import { listBookings, patchBooking } from './_lib/booking-store.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

/** The owner's bookings. GET /api/bookings lists them; PATCH /api/bookings/:id cancels one or notes that its reminder was sent. Part of the Pro plan. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  if (!planLimits(session.user.plan).business) return upgradeResponse('Bookings are part of the Pro plan.', 'pro')
  const userId = session.user.id
  const id = new URL(req.url).pathname.split('/').filter(Boolean)[2]?.replace(/\.html?$/, '') ?? null

  try {
    if (req.method === 'GET' && id === null) return json<{ bookings: Booking[] }>({ bookings: await listBookings(userId) })
    if (req.method === 'PATCH' && id !== null) {
      if (!z.uuid().safeParse(id).success) return errorResponse(400, 'Invalid id.')
      const patch = bookingPatchSchema.safeParse(await req.json().catch(() => null))
      if (!patch.success) return errorResponse(400, 'That change was not understood.')
      const result = await patchBooking(userId, id, { cancel: patch.data.status === 'CANCELLED', reminded: patch.data.reminded === true })
      return result.ok ? json<Booking>(result.booking) : errorResponse(404, 'That booking was not found.')
    }
    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Bookings request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your bookings. Please try again.')
  }
}

export const config: Config = { path: ['/api/bookings', '/api/bookings/*'] }
