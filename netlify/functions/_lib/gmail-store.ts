import { neon } from '@neondatabase/serverless'
import type { GmailLogAction, GmailLogEntry, PendingEmail } from '../../../src/types/gmail.ts'
import { decryptText, encryptText, openText } from './crypto.ts'

/** Everything about the Gmail connection that lives in the database. Tokens, addresses and message text are encrypted per person. */

const PENDING_MINUTES = 20
const LOG_KEEP_DAYS = 90
const LOG_LIMIT = 60
const MAX_DETAIL_CHARS = 300

const sql = () => neon(process.env.DATABASE_URL ?? '')

export interface Connection {
  email: string
  refreshToken: string
  needsReconnect: boolean
  connectedAt: string
}

interface ConnectionRow {
  google_email: string
  refresh_token: string
  needs_reconnect: boolean
  connected_at: string | Date
}

export async function getConnection(userId: string): Promise<Connection | null> {
  const [row] = (await sql().query('SELECT google_email, refresh_token, needs_reconnect, connected_at FROM gmail_connections WHERE user_id = $1', [userId])) as ConnectionRow[]
  if (!row) return null
  return {
    email: decryptText(userId, 'gmail.email', row.google_email),
    refreshToken: decryptText(userId, 'gmail.refresh_token', row.refresh_token),
    needsReconnect: row.needs_reconnect,
    connectedAt: new Date(row.connected_at).toISOString(),
  }
}

export async function saveConnection(userId: string, email: string, refreshToken: string): Promise<void> {
  await sql().query(
    `INSERT INTO gmail_connections (user_id, google_email, refresh_token, needs_reconnect, connected_at) VALUES ($1, $2, $3, false, now())
     ON CONFLICT (user_id) DO UPDATE SET google_email = EXCLUDED.google_email, refresh_token = EXCLUDED.refresh_token, needs_reconnect = false, connected_at = now()`,
    [userId, encryptText(userId, 'gmail.email', email), encryptText(userId, 'gmail.refresh_token', refreshToken)],
  )
}

export async function markNeedsReconnect(userId: string): Promise<void> {
  await sql().query('UPDATE gmail_connections SET needs_reconnect = true WHERE user_id = $1', [userId])
}

/** Removes the connection and any email still waiting for approval. The log is kept so the person can still see what happened. */
export async function deleteConnection(userId: string): Promise<void> {
  await sql().query('DELETE FROM gmail_pending WHERE user_id = $1', [userId])
  await sql().query('DELETE FROM gmail_connections WHERE user_id = $1', [userId])
}

// ---------- The record of what was read and sent ----------

export async function logGmail(userId: string, action: GmailLogAction, detail = ''): Promise<void> {
  try {
    await sql().query('INSERT INTO gmail_log (user_id, action, detail) VALUES ($1, $2, $3)', [userId, action, encryptText(userId, 'gmail.log', detail.slice(0, MAX_DETAIL_CHARS))])
    if (action === 'connect') await sql().query(`DELETE FROM gmail_log WHERE user_id = $1 AND created_at < now() - interval '${LOG_KEEP_DAYS} days'`, [userId])
  } catch (err) {
    // The record is secondary: never let it stop a connection, read or send.
    console.error('Could not write the Gmail record:', err instanceof Error ? err.name : 'error')
  }
}

export async function listLog(userId: string): Promise<GmailLogEntry[]> {
  const rows = (await sql().query('SELECT id, action, detail, created_at FROM gmail_log WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2', [userId, LOG_LIMIT])) as {
    id: string | number
    action: GmailLogAction
    detail: string
    created_at: string | Date
  }[]
  return rows.map((row) => ({ id: Number(row.id), action: row.action, detail: openText(userId, 'gmail.log', row.detail), createdAt: new Date(row.created_at).toISOString() }))
}

// ---------- An email waiting for the person's approval ----------

export interface NewPending {
  to: string
  subject: string
  body: string
  threadId: string | null
  replyToId: string | null
  differs: boolean
}

interface PendingRow {
  id: string
  to_addr: string
  subject: string
  body: string
  thread_id: string | null
  reply_to_id: string | null
  differs: boolean
  expires_at: string | Date
}

export interface PendingFull extends PendingEmail {
  threadId: string | null
  replyToId: string | null
}

function toPending(userId: string, row: PendingRow): PendingFull {
  return {
    id: row.id,
    to: decryptText(userId, 'gmail.to', row.to_addr),
    subject: decryptText(userId, 'gmail.subject', row.subject),
    body: decryptText(userId, 'gmail.body', row.body),
    differs: row.differs,
    replyToSubject: null,
    expiresAt: new Date(row.expires_at).toISOString(),
    threadId: row.thread_id,
    replyToId: row.reply_to_id,
  }
}

/** Saves a new email for approval. There is only ever one: a newer one replaces the older one, so a stale email can never be sent by mistake. */
export async function createPending(userId: string, email: NewPending): Promise<PendingFull> {
  await sql().query('DELETE FROM gmail_pending WHERE user_id = $1', [userId])
  const [row] = (await sql().query(
    `INSERT INTO gmail_pending (user_id, to_addr, subject, body, thread_id, reply_to_id, differs, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '${PENDING_MINUTES} minutes')
     RETURNING id, to_addr, subject, body, thread_id, reply_to_id, differs, expires_at`,
    [userId, encryptText(userId, 'gmail.to', email.to), encryptText(userId, 'gmail.subject', email.subject), encryptText(userId, 'gmail.body', email.body), email.threadId, email.replyToId, email.differs],
  )) as PendingRow[]
  if (!row) throw new Error('Could not save the email.')
  return toPending(userId, row)
}

/** The email currently waiting for this person, if it has not expired. */
export async function getPending(userId: string): Promise<PendingFull | null> {
  const [row] = (await sql().query(
    `SELECT id, to_addr, subject, body, thread_id, reply_to_id, differs, expires_at FROM gmail_pending
     WHERE user_id = $1 AND status = 'pending' AND expires_at > now() ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )) as PendingRow[]
  return row ? toPending(userId, row) : null
}

/**
 * Claims a waiting email for sending. It succeeds for exactly one caller, so two taps or two requests at once cannot
 * send the same email twice. If the send then fails, call {@link releasePending}.
 */
export async function claimPending(userId: string, id: string): Promise<PendingFull | null> {
  const [row] = (await sql().query(
    `UPDATE gmail_pending SET status = 'sent' WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > now()
     RETURNING id, to_addr, subject, body, thread_id, reply_to_id, differs, expires_at`,
    [id, userId],
  )) as PendingRow[]
  return row ? toPending(userId, row) : null
}

export async function releasePending(userId: string, id: string): Promise<void> {
  await sql().query("UPDATE gmail_pending SET status = 'pending' WHERE id = $1 AND user_id = $2 AND status = 'sent'", [id, userId])
}

export async function cancelPending(userId: string, id: string): Promise<boolean> {
  const rows = (await sql().query("DELETE FROM gmail_pending WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id", [id, userId])) as unknown[]
  return rows.length > 0
}

/** Once an email has been sent its text is no longer needed here, so the row is deleted rather than kept. */
export async function deleteSent(userId: string, id: string): Promise<void> {
  await sql().query("DELETE FROM gmail_pending WHERE id = $1 AND user_id = $2 AND status = 'sent'", [id, userId])
}
