import { limitCalendars, profileFromUser } from '../../../src/lib/profile.ts'
import { planLimits, type PlanId } from '../../../src/types/plans.ts'
import type { Profile, ProfileSource } from '../../../src/types/profile.ts'
import { auth } from './auth.ts'
import { openCalendarLink } from './calendar-secret.ts'
import { ACCOUNT_CLOSED_MESSAGE, isAdult } from '../../../src/lib/age.ts'
import { TERMS_NEEDED_MESSAGE, TERMS_VERSION } from '../../../src/lib/terms.ts'
import type { ApiError } from '../../../src/types/api.ts'
import { errorResponse, json } from './http.ts'
import { isOwner, resolvePlan, type PlanSource } from './plan.ts'
import { describeError } from './safe-log.ts'
import { neon } from '@neondatabase/serverless'
import { bearerToken, userIdForShortcutToken } from './shortcut-token.ts'

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

/** A person's stored record, as the sign-in library returns it or as read straight from the database. */
interface UserRecord extends ProfileSource {
  id: string
  email: string
  suspendedAt?: Date | string | null
  birthDate?: string | null
  termsVersion?: string | null
}

/** The checks every request makes before it may act for a person: not closed, an adult, terms accepted. Then their plan and profile. */
async function toSessionUser(record: UserRecord): Promise<UserResult> {
  const { id, email, suspendedAt, birthDate } = record
  // 423 and 428 rather than 403, which Netlify's local server mistakes for a missing page.
  if (suspendedAt) return { ok: false, response: json<ApiError>({ error: ACCOUNT_CLOSED_MESSAGE, code: 'suspended' }, 423) }
  // Accounts made before the age check give their date of birth once before they can carry on.
  if (!isAdult(birthDate)) return { ok: false, response: json<ApiError>({ error: 'Please confirm your date of birth to carry on.', code: 'age_required' }, 428) }
  // Nothing works until the current terms have been gone through and accepted.
  if (record.termsVersion !== TERMS_VERSION) return { ok: false, response: json<ApiError>({ error: TERMS_NEEDED_MESSAGE, code: 'terms_required' }, 428) }
  const profile = profileFromUser(record)
  const { plan, source } = await resolvePlan(id, email)
  // The saved calendar link is encrypted; servers use the opened copy, and the browser only ever sees the sealed one.
  const calendarUrl = limitCalendars(openCalendarLink(profile.calendarUrl), planLimits(plan).calendars)
  return { ok: true, user: { id, email, profile: { ...profile, calendarUrl }, plan, planSource: source, isOwner: isOwner(email) } }
}

/** Resolves the signed-in user from the session cookie, or a 401 response to return as-is. */
export async function requireUser(req: Request): Promise<UserResult> {
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    if (session) return await toSessionUser(session.user)
  } catch (err) {
    console.error('Session lookup failed:', describeError(err))
    return { ok: false, response: errorResponse(500, 'Could not verify your session. Please try again.') }
  }
  return { ok: false, response: errorResponse(401, 'Please sign in.') }
}

/**
 * Like {@link requireUser}, but also accepts the iPhone Shortcut's access token (an Authorization: Bearer header). Only the
 * functions that a Shortcut may call use this; everything else needs the sign-in cookie.
 */
export async function requireUserOrShortcut(req: Request): Promise<UserResult> {
  const token = bearerToken(req)
  if (!token) return requireUser(req)
  try {
    const userId = await userIdForShortcutToken(token)
    if (!userId) return { ok: false, response: errorResponse(401, 'That Shortcut access code is not valid. Make a new one in Volita under Profile.') }
    const [record] = (await neon(process.env.DATABASE_URL ?? '').query('SELECT * FROM "user" WHERE id = $1', [userId])) as UserRecord[]
    if (!record) return { ok: false, response: errorResponse(401, 'Please sign in.') }
    return await toSessionUser(record)
  } catch (err) {
    console.error('Shortcut token lookup failed:', describeError(err))
    return { ok: false, response: errorResponse(500, 'Could not verify your access code. Please try again.') }
  }
}
