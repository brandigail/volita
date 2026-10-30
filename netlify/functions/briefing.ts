import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import type { Briefing, FollowUp } from '../../src/types/plan-state.ts'
import { planLimits } from '../../src/types/plans.ts'
import { listAgenda } from './_lib/agenda.ts'
import { openText } from './_lib/crypto.ts'
import { errorResponse, json } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'
import { addDays, safeTimeZone, startOfZonedDay, todayIn } from './_lib/time.ts'

/** A quote nobody has answered after this many days is worth a nudge. */
const FOLLOW_UP_AFTER_DAYS = 3
const FOLLOW_UP_WINDOW_DAYS = 30
const MAX_FOLLOW_UPS = 10

interface FollowUpRow {
  id: string
  recipient: string
  subject: string
  sent_at: string | Date
}

const timeOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

function say(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Today at a glance. Pro gets the whole briefing (meetings, sends that are due, quotes to chase); Basic gets just the
 * quotes to chase; Free gets an empty one. Nothing here uses the AI, so it is instant and free to run.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed.')
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session
  const limits = planLimits(user.plan)
  const timeZone = safeTimeZone(new URL(req.url).searchParams.get('tz') ?? '')

  try {
    const now = new Date()
    const dayStart = startOfZonedDay(todayIn(timeZone, now), timeZone)
    const dayEnd = dayStart ? addDays(dayStart, 1) : null

    let meetings: Briefing['meetings'] = null
    let overdue: Briefing['overdue'] = null
    if (limits.morningBriefing && dayStart && dayEnd) {
      const agenda = await listAgenda(user.id, user.profile.calendarUrl, dayStart, dayEnd)
      const planned = agenda.items.filter((item) => item.source === 'draft')
      overdue = planned
        .filter((item) => new Date(item.startsAt) <= now)
        .map((item) => ({ id: item.id.replace(/^draft-/, ''), title: item.title, dueAt: item.startsAt }))
      meetings = agenda.items
        .filter((item) => item.source !== 'draft' || new Date(item.startsAt) > now)
        .map((item) => ({ title: item.title, startsAt: item.startsAt, allDay: item.allDay }))
    }

    let followUps: Briefing['followUps'] = null
    if (limits.followUps) {
      const sql = neon(process.env.DATABASE_URL ?? '')
      const rows = (await sql.query(
        `SELECT id, recipient, subject, sent_at FROM drafts
         WHERE user_id = $1 AND category = 'QUOTE' AND sent_at IS NOT NULL AND followup_done_at IS NULL
           AND sent_at < now() - make_interval(days => $2) AND sent_at > now() - make_interval(days => $3)
         ORDER BY sent_at LIMIT ${MAX_FOLLOW_UPS}`,
        [user.id, FOLLOW_UP_AFTER_DAYS, FOLLOW_UP_WINDOW_DAYS],
      )) as FollowUpRow[]
      followUps = rows.map(
        (row): FollowUp => ({
          id: row.id,
          recipient: openText(user.id, 'drafts.recipient', row.recipient),
          subject: openText(user.id, 'drafts.subject', row.subject),
          sentAt: new Date(row.sent_at).toISOString(),
          daysAgo: Math.floor((now.getTime() - new Date(row.sent_at).getTime()) / 86_400_000),
        }),
      )
    }

    const parts: string[] = []
    if (meetings) {
      const timed = meetings.filter((m) => !m.allDay)
      parts.push(
        timed.length === 0
          ? 'Nothing on your agenda today.'
          : `You have ${say(timed.length, 'thing', 'things')} on today, starting with ${timed[0].title} at ${timeOf(timed[0].startsAt, timeZone)}.`,
      )
    }
    if (overdue && overdue.length > 0) parts.push(`${say(overdue.length, 'message is', 'messages are')} due to send.`)
    if (followUps && followUps.length > 0) {
      parts.push(`${say(followUps.length, 'quote has', 'quotes have')} had no answer for ${FOLLOW_UP_AFTER_DAYS} days or more, worth a nudge.`)
    }
    if (parts.length === 0) parts.push(limits.followUps ? 'No quotes are waiting for a reply.' : 'Nothing to report.')

    return json<Briefing>({ meetings, overdue, followUps, summary: parts.join(' ') })
  } catch (err) {
    console.error('Briefing failed:', describeError(err))
    return errorResponse(500, 'Could not put your briefing together. Please try again.')
  }
}

export const config: Config = { path: '/api/briefing' }
