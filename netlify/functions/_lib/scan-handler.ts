import type { z } from 'zod'
import { scanImageSchema } from '../../../src/types/scan.ts'
import { planLimits } from '../../../src/types/plans.ts'
import { logActivity } from './activity.ts'
import { errorResponse, json, upgradeResponse } from './http.ts'
import { claimQuota } from './rate-limit.ts'
import { requireUser } from './session.ts'
import { readStructured } from './vision-reader.ts'

/** Netlify's free plan stops a function after 10 seconds, so the model gets 9 (the same as photo captions and chat reading). */
const DEADLINE_MS = 9_000

export interface ScanOptions<T, R> {
  /** Shown in the activity record, for example "card". */
  kind: string
  /** What the page being read is called in messages: "that business card". */
  subject: string
  system: string
  instruction: string
  schema: z.ZodType<T, unknown>
  /** Turns what was read into the answer sent back. */
  shape: (value: T) => R
}

/**
 * A function that reads one photo (a business card, a receipt) and answers with what it says. The photo is sent by the app already
 * shrunk, is read once and is never stored. Part of the Pro plan, and counted against a daily limit because each read is a vision call.
 */
export function scanHandler<T, R>(options: ScanOptions<T, R>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== 'POST') return errorResponse(405, 'Method not allowed.')
    const session = await requireUser(req)
    if (!session.ok) return session.response
    const { user } = session
    if (!planLimits(user.plan).business) return upgradeResponse('Scanning is part of the Pro plan.', 'pro')

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return errorResponse(500, 'Server is not configured.')
    const body = scanImageSchema.safeParse(await req.json().catch(() => null))
    if (!body.success) return errorResponse(400, 'Send one photo (JPEG, PNG or WebP) under about 1 MB.')

    const quota = await claimQuota(user, 'scan')
    if (!quota.ok) return quota.response

    const result = await readStructured({ apiKey, image: body.data.image, system: options.system, instruction: options.instruction, schema: options.schema, subject: options.subject, deadlineMs: DEADLINE_MS })
    if (!result.ok) {
      await logActivity(user, `${options.kind}_scan_failed`, { status: result.status })
      return errorResponse(result.status, result.message)
    }
    // The record keeps that a scan happened, never what it said.
    await logActivity(user, `${options.kind}_scan_read`, {})
    return json(options.shape(result.value))
  }
}
