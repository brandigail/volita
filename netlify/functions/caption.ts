import type { Config } from '@netlify/functions'
import { z } from 'zod'
import type { GenerateResponse } from '../../src/types/api.ts'
import { DRAFT_CATEGORIES } from '../../src/types/draft.ts'
import { planForChannel, planLimits } from '../../src/types/plans.ts'
import { logActivity } from './_lib/activity.ts'
import { writeDraft } from './_lib/draft-generator.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { loadMemoryContext } from './_lib/memory-context.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { requireUser } from './_lib/session.ts'

const DEADLINE_MS = 9_000
/** The app shrinks photos before sending; this keeps the request far under Netlify's 6 MB limit. */
const MAX_IMAGE_CHARS = 1_800_000

const requestSchema = z.object({
  image: z.string().max(MAX_IMAGE_CHARS).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  category: z.enum(DRAFT_CATEGORIES),
  /** What the person says about the photo, if anything. */
  note: z.string().trim().max(500).default(''),
})

/** Photo to caption: a post or message written about a photo (Basic and up). */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed.')
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session
  const limits = planLimits(user.plan)
  if (!limits.photoCaption) return upgradeResponse('Photo to caption is part of the Basic plan.', 'basic')

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return errorResponse(500, 'Server is not configured.')

  const request = requestSchema.safeParse(await req.json().catch(() => null))
  if (!request.success) return errorResponse(400, 'Send a JPEG, PNG or WebP photo and a channel.')
  const { image, category, note } = request.data
  if (!limits.channels.includes(category)) return upgradeResponse('That channel is not part of your plan.', planForChannel(category))

  const quota = await claimQuota(user, 'caption')
  if (!quota.ok) return quota.response

  const transcript = note || 'Write a post about this photo.'
  const result = await writeDraft({
    apiKey,
    category,
    transcript,
    profile: user.profile,
    deadlineMs: DEADLINE_MS,
    footer: limits.footer,
    memory: limits.memoryItems === 0 ? '' : await loadMemoryContext(user.id, transcript),
    image,
  })
  if (!result.ok) {
    await logActivity(user, 'caption_failed', { category, status: result.status, message: result.message })
    return errorResponse(result.status, result.message)
  }
  await logActivity(user, 'caption_written', { category, note, draft: result.draft })
  return json<GenerateResponse>({ draft: result.draft })
}

export const config: Config = { path: '/api/caption' }
