import type { Config } from '@netlify/functions'
import { bookingPageSchema, type BookingPage } from '../../src/types/booking.ts'
import { planLimits } from '../../src/types/plans.ts'
import { defaultPage, getPage, savePage } from './_lib/booking-store.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'
import { safeTimeZone } from './_lib/time.ts'

/** The owner's booking link settings. GET /api/booking-page gives the saved page, or a first draft to start from; PUT saves it. Part of the Pro plan. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  if (!planLimits(session.user.plan).business) return upgradeResponse('The booking link is part of the Pro plan.', 'pro')
  const userId = session.user.id

  try {
    if (req.method === 'GET') {
      const saved = await getPage(userId)
      const zone = safeTimeZone(new URL(req.url).searchParams.get('tz') ?? '')
      return json<{ page: BookingPage; saved: boolean }>({ page: saved ?? defaultPage(session.user.profile.businessName || session.user.profile.name, zone), saved: saved !== null })
    }
    if (req.method === 'PUT') {
      const input = bookingPageSchema.safeParse(await req.json().catch(() => null))
      if (!input.success) return errorResponse(400, input.error.issues[0]?.message ?? 'Those settings were not understood.')
      const result = await savePage(userId, { ...input.data, timeZone: safeTimeZone(input.data.timeZone) })
      return result.ok ? json<BookingPage>(input.data) : errorResponse(409, result.message)
    }
    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Booking page request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your booking page. Please try again.')
  }
}

export const config: Config = { path: '/api/booking-page' }
