import { neon } from '@neondatabase/serverless'

/** Closing and reopening accounts. A closed account cannot sign in, and every request it still makes is refused. */

const sql = () => neon(process.env.DATABASE_URL ?? '')

export async function isSuspended(userId: string): Promise<boolean> {
  const [row] = (await sql().query('SELECT "suspendedAt" FROM "user" WHERE id = $1', [userId])) as { suspendedAt: string | Date | null }[]
  return Boolean(row?.suspendedAt)
}

/** Closes the account and signs it out everywhere at once by deleting its sessions. */
export async function suspendUser(userId: string, reason: string): Promise<void> {
  await sql().query('UPDATE "user" SET "suspendedAt" = now(), "suspendedReason" = $2 WHERE id = $1', [userId, reason.slice(0, 200)])
  await sql().query('DELETE FROM "session" WHERE "userId" = $1', [userId])
}

export async function reopenUser(userId: string): Promise<void> {
  await sql().query('UPDATE "user" SET "suspendedAt" = NULL, "suspendedReason" = NULL WHERE id = $1', [userId])
}
