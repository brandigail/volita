import { neon } from '@neondatabase/serverless'
import { randomBytes } from 'node:crypto'
import type { MailProviderId, MailServer } from '../../../src/types/mail.ts'
import { decryptText, encryptText } from './crypto.ts'

/** Connected email accounts other than Gmail, kept encrypted per person. Gmail lives in gmail-store.ts. */

const sql = () => neon(process.env.DATABASE_URL ?? '')

export type AccountProvider = Exclude<MailProviderId, 'gmail'>

export interface ServerSettings {
  imap: MailServer
  smtp: MailServer
}

export interface MailAccount {
  provider: AccountProvider
  email: string
  /** The app password, or for Outlook the refresh token. */
  secret: string
  settings: ServerSettings | null
  needsReconnect: boolean
  connectedAt: string
}

interface AccountRow {
  provider: AccountProvider
  email: string
  secret: string
  settings: Partial<ServerSettings> | null
  needs_reconnect: boolean
  connected_at: string | Date
}

export async function getAccount(userId: string): Promise<MailAccount | null> {
  const [row] = (await sql().query('SELECT provider, email, secret, settings, needs_reconnect, connected_at FROM mail_accounts WHERE user_id = $1', [userId])) as AccountRow[]
  if (!row) return null
  const { imap, smtp } = row.settings ?? {}
  return {
    provider: row.provider,
    email: decryptText(userId, 'mail.email', row.email),
    secret: decryptText(userId, 'mail.secret', row.secret),
    settings: imap && smtp ? { imap, smtp } : null,
    needsReconnect: row.needs_reconnect,
    connectedAt: new Date(row.connected_at).toISOString(),
  }
}

/** Saves the account. A person has one mailbox at a time, so a Gmail connection is removed when another is saved. */
export async function saveAccount(userId: string, provider: AccountProvider, email: string, secret: string, settings: ServerSettings | null): Promise<void> {
  await sql().query('DELETE FROM gmail_connections WHERE user_id = $1', [userId])
  await sql().query(
    `INSERT INTO mail_accounts (user_id, provider, email, secret, settings, needs_reconnect, connected_at) VALUES ($1, $2, $3, $4, $5, false, now())
     ON CONFLICT (user_id) DO UPDATE SET provider = EXCLUDED.provider, email = EXCLUDED.email, secret = EXCLUDED.secret, settings = EXCLUDED.settings, needs_reconnect = false, connected_at = now()`,
    [userId, provider, encryptText(userId, 'mail.email', email), encryptText(userId, 'mail.secret', secret), JSON.stringify(settings ?? {})],
  )
}

/** Microsoft hands out a new refresh token each time one is used; the newest is kept. */
export async function updateSecret(userId: string, secret: string): Promise<void> {
  await sql().query('UPDATE mail_accounts SET secret = $2 WHERE user_id = $1', [userId, encryptText(userId, 'mail.secret', secret)])
}

export async function markAccountNeedsReconnect(userId: string): Promise<void> {
  await sql().query('UPDATE mail_accounts SET needs_reconnect = true WHERE user_id = $1', [userId])
}

export async function deleteAccount(userId: string): Promise<void> {
  await sql().query('DELETE FROM gmail_pending WHERE user_id = $1', [userId])
  await sql().query('DELETE FROM mail_handles WHERE user_id = $1', [userId])
  await sql().query('DELETE FROM mail_accounts WHERE user_id = $1', [userId])
}

// ---------- Short handles for long message ids ----------

const HANDLE_KEEP_DAYS = 3

/** A short id the assistant can repeat reliably, standing for a long one. */
export async function handleFor(userId: string, ref: string): Promise<string> {
  const [existing] = (await sql().query('SELECT handle FROM mail_handles WHERE user_id = $1 AND ref = $2 LIMIT 1', [userId, ref])) as { handle: string }[]
  if (existing) return existing.handle
  const handle = `o${randomBytes(6).toString('hex')}`
  await sql().query('INSERT INTO mail_handles (user_id, handle, ref) VALUES ($1, $2, $3)', [userId, handle, ref])
  if (Math.random() < 0.1) await sql().query(`DELETE FROM mail_handles WHERE user_id = $1 AND created_at < now() - interval '${HANDLE_KEEP_DAYS} days'`, [userId])
  return handle
}

export async function refFor(userId: string, handle: string): Promise<string | null> {
  const [row] = (await sql().query('SELECT ref FROM mail_handles WHERE user_id = $1 AND handle = $2', [userId, handle])) as { ref: string }[]
  return row?.ref ?? null
}
