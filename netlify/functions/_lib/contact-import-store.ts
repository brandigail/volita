import { neon } from '@neondatabase/serverless'
import { markDuplicates, type ImportedContact } from '../../../src/lib/contact-import.ts'
import { MEMORY_LIMITS } from '../../../src/types/memory.ts'
import { encryptText } from './crypto.ts'
import { listContacts } from './memory-store.ts'

export interface ImportResult {
  added: number
  /** Already saved (same name, number or email), so left alone. */
  skippedExisting: number
  /** Left out because the plan or the overall limit has no room for them. */
  skippedNoRoom: number
}

/**
 * Saves many contacts in one go, as one database statement. Anyone already saved is skipped (by name, number or email), so running the
 * same import twice adds nothing, and only the room left on the plan is used. `cap` is the plan's limit, or null for none.
 */
export async function importContacts(userId: string, incoming: readonly ImportedContact[], cap: number | null): Promise<ImportResult> {
  const existing = await listContacts(userId)
  const fresh = markDuplicates(existing, incoming).filter((contact) => !contact.duplicate)
  const ceiling = Math.min(cap ?? MEMORY_LIMITS.contacts, MEMORY_LIMITS.contacts)
  const toAdd = fresh.slice(0, Math.max(0, ceiling - existing.length))

  if (toAdd.length > 0) {
    const values: string[] = []
    const params: string[] = [userId]
    for (const contact of toAdd) {
      const base = params.length
      values.push(`($1, $${base + 1}, $${base + 2}, $${base + 3}, '', '')`)
      params.push(encryptText(userId, 'contacts.name', contact.name), encryptText(userId, 'contacts.email', contact.email), encryptText(userId, 'contacts.phone', contact.phone))
    }
    await neon(process.env.DATABASE_URL ?? '').query(`INSERT INTO contacts (user_id, name, email, phone, relationship, notes) VALUES ${values.join(', ')}`, params)
  }
  return { added: toAdd.length, skippedExisting: incoming.length - fresh.length, skippedNoRoom: fresh.length - toAdd.length }
}
