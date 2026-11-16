import { limitCalendars, profileFromUser } from '../../../src/lib/profile.ts'
import { planLimits, type PlanId } from '../../../src/types/plans.ts'
import type { Profile } from '../../../src/types/profile.ts'
import { auth } from './auth.ts'
import { openCalendarLink } from './calendar-secret.ts'
import { ACCOUNT_CLOSED_MESSAGE, isAdult } from '../../../src/lib/age.ts'
import { TERMS_NEEDED_MESSAGE, TERMS_VERSION } from '../../../src/lib/terms.ts'
import type { ApiError } from '../../../src/types/api.ts'
import { errorResponse, json } from './http.ts'
import { isOwner, resolvePlan, type PlanSource } from './plan.ts'
import { describeError } from './safe-log.ts'

export interface SessionUser {
  id: string
  email: string
  profile: Profile
  /** Decided on the server for every request; limits are enforced from this, never from anything the browser sends. */
  plan: PlanId
  planSource: PlanSource
  isOwner: boolean
}

type UserResult = { ok: true; user: SessionUser } | { ok: false; response: Response }

/** Resolves the signed-in user from the session cookie, or a 401 response to return as-is. */
export async function requireUser(req: Request): Promise<UserResult> {
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (session) {
      const { id, email, suspendedAt, birthDate } = session.user
      // 423 and 428 rather than 403, which Netlify's local server mistakes for a missing page.
      if (suspendedAt) return { ok: false, response: json<ApiError>({ error: ACCOUNT_CLOSED_MESSAGE, code: 'suspended' }, 423) }
      // Accounts made before the age check give their date of birth once before they can carry on.
      if (!isAdult(birthDate)) return { ok: false, response: json<ApiError>({ error: 'Please confirm your date of birth to carry on.', code: 'age_required' }, 428) }
      // Nothing works until the current terms have been gone through and accepted.
      if (session.user.termsVersion !== TERMS_VERSION) return { ok: false, response: json<ApiError>({ error: TERMS_NEEDED_MESSAGE, code: 'terms_required' }, 428) }
      const profile = profileFromUser(session.user)
      const { plan, source } = await resolvePlan(id, email)
      // The saved calendar link is encrypted; servers use the opened copy, and the browser only ever sees the sealed one.
      const calendarUrl = limitCalendars(openCalendarLink(profile.calendarUrl), planLimits(plan).calendars)
      return { ok: true, user: { id, email, profile: { ...profile, calendarUrl }, plan, planSource: source, isOwner: isOwner(email) } }
    }
  } catch (err) {
    console.error('Session lookup failed:', describeError(err))
    return { ok: false, response: errorResponse(500, 'Could not verify your session. Please try again.') }
  }
  return { ok: false, response: errorResponse(401, 'Please sign in.') }
}
