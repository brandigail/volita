import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { MAX_CHAT_IMAGES, type CatchUp } from '../../src/types/catchup.ts'
import { logActivity } from './_lib/activity.ts'
import { readChat } from './_lib/chat-reader.ts'
import { errorResponse, json } from './_lib/http.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { requireUser } from './_lib/session.ts'

/** Netlify's free plan stops a function after 10 seconds, so the model gets 9 (the same as photo captions). */
const DEADLINE_MS = 9_000
/** The app shrinks each screenshot; these keep the whole request well under Netlify's 6 MB limit. */
const MAX_IMAGE_CHARS = 1_400_000
const MAX_TOTAL_CHARS = 4_500_000

const requestSchema = z.object({
  images: z
    .array(z.string().max(MAX_IMAGE_CHARS).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/))
    .min(1)
    .max(MAX_CHAT_IMAGES),
})

/**
 * Catch me up: reads screenshots of a chat and returns who said what, a short summary and what is being asked.
 * Nothing is stored: the screenshots and the messages exist only for this request, because they hold other people's words.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed.')
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return errorResponse(500, 'Server is not configured.')

  const request = requestSchema.safeParse(await req.json().catch(() => null))
  if (!request.success) return errorResponse(400, `Send between 1 and ${MAX_CHAT_IMAGES} chat screenshots (JPEG, PNG or WebP).`)
  const { images } = request.data
  if (images.reduce((total, image) => total + image.length, 0) > MAX_TOTAL_CHARS) return errorResponse(413, 'Those screenshots are too big. Try fewer of them.')

  const quota = await claimQuota(user, 'catchup')
  if (!quota.ok) return quota.response

  const result = await readChat({ apiKey, images, deadlineMs: DEADLINE_MS })
  if (!result.ok) {
    await logActivity(user, 'catchup_failed', { status: result.status, message: result.message, images: images.length })
    return errorResponse(result.status, result.message)
  }
  // The log keeps only counts, not what the chat said.
  await logActivity(user, 'catchup_read', { images: images.length, messages: result.catchUp.messages.length, needsReply: result.catchUp.needsReply })
  return json<{ catchUp: CatchUp }>({ catchUp: result.catchUp })
}

export const config: Config = { path: '/api/read-chat' }
