import { neon } from '@neondatabase/serverless'
import { findSensitive, sensitiveMessage } from '../../../src/lib/sensitive.ts'
import type { ApiError } from '../../../src/types/api.ts'
import { SAFETY_KIND_LABEL, STRIKE_LIMIT, type SafetyCounts, type SafetyKind } from '../../../src/types/safety.ts'
import { json } from './http.ts'
import { sendEmail } from './mailer.ts'
import { ownerEmails } from './plan.ts'
import { describeError } from './safe-log.ts'

/**
 * The safety checks. Text with card numbers, bank details or passwords is refused before it reaches the AI or the
 * database, and the try is counted (only its kind, never the text). Someone who keeps trying, keeps hammering past
 * the limits or sends too many emails is reported to the owner, who can close the account.
 */

/** Limit refusals in 24 hours that look like someone (or a script) pushing past the limits rather than an upgrade moment. */
export const LIMIT_ALERT = 25
/** Limit refusals worth recording per person per day; beyond this the record would only fill the table. */
const LIMIT_RECORD_CAP = 60

const sql = () => neon(process.env.DATABASE_URL ?? '')

interface Person {
  id: string
}

async function record(userId: string, kind: SafetyKind, source: string): Promise<void> {
  await sql().query('INSERT INTO safety_events (user_id, kind, source) VALUES ($1, $2, $3)', [userId, kind, source.slice(0, 40)])
  // The privacy page promises 180 days; trimming now and then keeps that without a scheduled job.
  if (Math.random() < 1 / 20) await sql().query("DELETE FROM safety_events WHERE created_at < now() - interval '180 days'").catch(() => undefined)
}

/** The person's record over the last 30 days. */
export async function safetyCounts(userId: string): Promise<SafetyCounts> {
  const [row] = (await sql().query(
    `SELECT count(*) FILTER (WHERE kind IN ('card', 'bank', 'password'))::int AS sensitive,
            count(*) FILTER (WHERE kind = 'limit')::int AS limit_hits,
            count(*) FILTER (WHERE kind = 'spam')::int AS spam
     FROM safety_events WHERE user_id = $1 AND created_at > now() - interval '30 days'`,
    [userId],
  )) as { sensitive: number; limit_hits: number; spam: number }[]
  return { sensitive: row?.sensitive ?? 0, limit: row?.limit_hits ?? 0, spam: row?.spam ?? 0 }
}

/** Emails the owner, at most once a day per person. Never throws: a failed alert must not break the refusal. */
async function tellOwner(userId: string, what: string): Promise<void> {
  try {
    const [already] = (await sql().query("SELECT 1 FROM safety_events WHERE user_id = $1 AND owner_told AND created_at > now() - interval '24 hours' LIMIT 1", [userId])) as unknown[]
    if (already) return
    await sql().query('UPDATE safety_events SET owner_told = true WHERE id = (SELECT max(id) FROM safety_events WHERE user_id = $1)', [userId])
    const [person] = (await sql().query('SELECT email, name FROM "user" WHERE id = $1', [userId])) as { email: string; name: string }[]
    if (!person) return
    const counts = await safetyCounts(userId)
    const text = [
      `Volita stopped ${person.name} <${person.email}>: ${what}.`,
      '',
      'In the last 30 days:',
      `- ${counts.sensitive} tries with card numbers, bank details or passwords (blocked; nothing was saved or sent to the AI)`,
      `- ${counts.limit} refusals for going past the limits`,
      `- ${counts.spam} refusals for sending too many emails`,
      '',
      'To close the account: open Volita, go to Plans, find them under "Family and friends" and tap Close account.',
    ].join('\n')
    for (const to of ownerEmails()) await sendEmail({ to, subject: `Volita safety alert: ${person.email}`, text })
  } catch (err) {
    console.error('Could not tell the owner about a safety event:', describeError(err))
  }
}

const strikeNote = (strikes: number) =>
  strikes >= STRIKE_LIMIT
    ? ' This has happened several times, so the owner has been told and may close your account.'
    : ` Warning ${strikes} of ${STRIKE_LIMIT}. After ${STRIKE_LIMIT}, the owner is told and may close your account.`

/** Every piece of text inside a value (a string, or the strings inside an object or list), for checking. */
export function textsIn(value: unknown, depth = 0): string[] {
  if (typeof value === 'string') return [value]
  if (depth > 4 || value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap((inner: unknown) => textsIn(inner, depth + 1))
}

/**
 * Refuses text that holds card numbers, bank details or passwords, and counts the try. Returns null when the text is
 * fine. `content` is a string or a parsed request body (every string inside it is checked). Call it before the text
 * goes to the AI or is saved, and return the response as it is.
 */
export async function refuseSensitive(user: Person, content: unknown, source: string): Promise<Response | null> {
  // Each piece is checked on its own, so digits at the end of one field never join up with the start of the next.
  const kinds = [...new Set(textsIn(content).flatMap((text) => findSensitive(text)))]
  if (kinds.length === 0) return null
  let strikes = 1
  try {
    await record(user.id, kinds[0], source)
    strikes = (await safetyCounts(user.id)).sensitive
    if (strikes >= STRIKE_LIMIT) await tellOwner(user.id, `tried to send ${kinds.map((kind) => SAFETY_KIND_LABEL[kind].toLowerCase()).join(' and ')} (${strikes} tries in 30 days)`)
  } catch (err) {
    // The refusal stands even if the record could not be written.
    console.error('Could not record a safety event:', describeError(err))
  }
  return json<ApiError>({ error: sensitiveMessage(kinds) + strikeNote(strikes), code: 'sensitive', strikes, strikeLimit: STRIKE_LIMIT }, 422)
}

/** Called each time someone is refused for going past their own limits. Many in a day is reported to the owner. */
export async function noteLimitHit(userId: string, endpoint: string): Promise<void> {
  try {
    const rows = (await sql().query(
      `INSERT INTO safety_events (user_id, kind, source)
       SELECT $1, 'limit', $2 WHERE (SELECT count(*) FROM safety_events WHERE user_id = $1 AND kind = 'limit' AND created_at > now() - interval '24 hours') < $3
       RETURNING id`,
      [userId, endpoint.slice(0, 40), LIMIT_RECORD_CAP],
    )) as unknown[]
    if (rows.length === 0) return
    const [{ total }] = (await sql().query("SELECT count(*)::int AS total FROM safety_events WHERE user_id = $1 AND kind = 'limit' AND created_at > now() - interval '24 hours'", [userId])) as { total: number }[]
    if (total >= LIMIT_ALERT) await tellOwner(userId, `was refused ${total} times in 24 hours for going past the limits`)
  } catch (err) {
    console.error('Could not record a limit refusal:', describeError(err))
  }
}

/** Called when someone is stopped for sending too many emails. Always reported to the owner. */
export async function noteSpam(userId: string, source: string): Promise<void> {
  try {
    await record(userId, 'spam', source)
    await tellOwner(userId, 'tried to send more emails in a day than Volita allows')
  } catch (err) {
    console.error('Could not record a spam refusal:', describeError(err))
  }
}
