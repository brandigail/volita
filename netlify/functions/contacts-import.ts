import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { MAX_IMPORT } from '../../src/lib/contact-import.ts'
import { MEMORY_LIMITS } from '../../src/types/memory.ts'
import { planLimits } from '../../src/types/plans.ts'
import { importContacts } from './_lib/contact-import-store.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { describeError } from './_lib/safe-log.ts'
import { refuseSensitive } from './_lib/safety.ts'
import { requireUser } from './_lib/session.ts'

const requestSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(MEMORY_LIMITS.name),
        phone: z.string().trim().max(MEMORY_LIMITS.phone).default(''),
        email: z.string().trim().max(MEMORY_LIMITS.email).default(''),
      }),
    )
    .min(1)
    .max(MAX_IMPORT),
})

/**
 * Imports contacts the person chose from their phone's address book file (.vcf or .csv, read in the app). Only the name, number and
 * email are accepted, the same as for a contact added by hand, and they are stored scrambled like every other contact.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed.')
  const session = await requireUser(req)
  if (!session.ok) return session.response

  try {
    const input = requestSchema.safeParse(await req.json().catch(() => null))
    if (!input.success) return errorResponse(400, `Send between 1 and ${MAX_IMPORT} contacts, each with a name.`)
    const cap = planLimits(session.user.plan).contacts
    if (cap === 0) return upgradeResponse('Saved people are part of the Basic plan.', 'basic')
    const refused = await refuseSensitive(session.user, input.data, 'contact')
    if (refused) return refused
    const quota = await claimQuota(session.user, 'memory')
    if (!quota.ok) return quota.response
    return json(await importContacts(session.user.id, input.data.contacts, cap))
  } catch (err) {
    console.error('Contact import failed:', describeError(err))
    return errorResponse(500, 'Could not import your contacts. Please try again.')
  }
}

export const config: Config = { path: '/api/contacts-import' }
