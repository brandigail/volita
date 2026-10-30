import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { splitCalendarUrls } from '../../src/lib/profile.ts'
import { planLimits } from '../../src/types/plans.ts'
import { PROFILE_LIMITS } from '../../src/types/profile.ts'
import { openCalendarLink, sealCalendarLink } from './_lib/calendar-secret.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

const addSchema = z.object({ url: z.string().trim().min(8).max(500) })
const removeSchema = z.object({ index: z.number().int().min(0).max(9) })

export interface CalendarsResponse {
  /** Where each linked calendar lives (just the host, never the secret address). Only the calendars the plan allows are counted. */
  calendars: { host: string }[]
  /** How many the plan allows. */
  max: number
  /** Linked calendars kept but switched off because the plan allows fewer now. */
  inactive: number
}

function hostOf(address: string): string {
  try {
    return new URL(address.replace(/^webcal:/i, 'https:')).host
  } catch {
    return 'calendar'
  }
}

/** The linked calendars: list them, add one, remove one. Several are kept in one encrypted field, one address per line. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session
  const max = planLimits(user.plan).calendars
  const sql = neon(process.env.DATABASE_URL ?? '')

  try {
    const [row] = (await sql.query('SELECT "calendarUrl" AS stored FROM "user" WHERE id = $1', [user.id])) as { stored: string | null }[]
    const all = splitCalendarUrls(openCalendarLink(row?.stored ?? ''))

    const respond = (links: string[], status = 200): Response =>
      json<CalendarsResponse>({ calendars: links.slice(0, max).map((link) => ({ host: hostOf(link) })), max, inactive: Math.max(0, links.length - max) }, status)

    const save = async (links: string[]): Promise<void> => {
      const stored = links.length > 0 ? (sealCalendarLink({ calendarUrl: links.join('\n') }).calendarUrl as string) : ''
      if (stored.length > PROFILE_LIMITS.calendarUrl) throw new RangeError('too long')
      await sql.query('UPDATE "user" SET "calendarUrl" = $2, "updatedAt" = now() WHERE id = $1', [user.id, stored])
    }

    if (req.method === 'GET') return respond(all)

    if (req.method === 'POST') {
      const input = addSchema.safeParse(await req.json().catch(() => null))
      if (!input.success) return errorResponse(400, 'Send the calendar address.')
      if (max === 0) return upgradeResponse('Linking a calendar is part of the Basic plan.', 'basic')
      const active = all.slice(0, max)
      if (active.length >= max) {
        return upgradeResponse(max === 1 ? 'Your plan links one calendar. Remove it first, or upgrade to link up to three.' : `Your plan links up to ${max} calendars.`, 'pro')
      }
      const next = [...active, input.data.url, ...all.slice(max)]
      await save(next)
      return respond(next, 201)
    }

    if (req.method === 'DELETE') {
      const input = removeSchema.safeParse(await req.json().catch(() => null))
      if (!input.success || input.data.index >= all.length) return errorResponse(400, 'Choose a calendar to remove.')
      const next = all.filter((_, index) => index !== input.data.index)
      await save(next)
      return respond(next)
    }

    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Calendars request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your calendars. Please try again.')
  }
}

export const config: Config = { path: '/api/calendars' }
