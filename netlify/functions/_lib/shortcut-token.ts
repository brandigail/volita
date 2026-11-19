import { neon } from '@neondatabase/serverless'
import { createHash, randomBytes } from 'node:crypto'

/**
 * The access token for the iPhone Shortcut. It is only ever shown once, when it is made; the database keeps a hash.
 * It opens one door (reading a chat screenshot) and is replaced or revoked from Profile at any time.
 */

const PREFIX = 'vsk_'

export interface TokenStatus {
  exists: boolean
  createdAt: string | null
  lastUsedAt: string | null
}

const hash = (token: string): string => createHash('sha256').update(token).digest('hex')

/** Makes a new token for the person, replacing any earlier one, and returns it. This is the only time it can be seen. */
export async function createShortcutToken(userId: string): Promise<string> {
  const token = `${PREFIX}${randomBytes(32).toString('base64url')}`
  const sql = neon(process.env.DATABASE_URL ?? '')
  await sql.query(
    `INSERT INTO shortcut_tokens (user_id, token_hash) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = now(), last_used_at = NULL`,
    [userId, hash(token)],
  )
  return token
}

export async function revokeShortcutToken(userId: string): Promise<void> {
  await neon(process.env.DATABASE_URL ?? '').query('DELETE FROM shortcut_tokens WHERE user_id = $1', [userId])
}

export async function shortcutTokenStatus(userId: string): Promise<TokenStatus> {
  const rows = (await neon(process.env.DATABASE_URL ?? '').query('SELECT created_at, last_used_at FROM shortcut_tokens WHERE user_id = $1', [userId])) as { created_at: string | Date; last_used_at: string | Date | null }[]
  const row = rows[0]
  if (!row) return { exists: false, createdAt: null, lastUsedAt: null }
  return { exists: true, createdAt: new Date(row.created_at).toISOString(), lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null }
}

/** The person a token belongs to, or null. Notes that it was used. */
export async function userIdForShortcutToken(token: string): Promise<string | null> {
  if (!token.startsWith(PREFIX) || token.length > 100) return null
  const rows = (await neon(process.env.DATABASE_URL ?? '').query('UPDATE shortcut_tokens SET last_used_at = now() WHERE token_hash = $1 RETURNING user_id', [hash(token)])) as { user_id: string }[]
  return rows[0]?.user_id ?? null
}

/** The token from an `Authorization: Bearer ...` header, or null. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match ? match[1] : null
}
