import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { MAX_CHAT_IMAGES, readoutOf, type CatchUp } from '../../src/types/catchup.ts'
import { logActivity } from './_lib/activity.ts'
import { readChat } from './_lib/chat-reader.ts'
import { errorResponse, json } from './_lib/http.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { requireUserOrShortcut } from './_lib/session.ts'

/** Netlify's free plan stops a function after 10 seconds, so the model gets 9 (the same as photo captions). */
const DEADLINE_MS = 9_000
/** The app shrinks each screenshot; these keep the whole request well under Netlify's 6 MB limit. */
const MAX_IMAGE_CHARS = 1_400_000
const MAX_TOTAL_CHARS = 4_500_000
/** A screenshot sent as a plain file (from the iPhone Shortcut) must be about the size of one shrunk screenshot. */
const MAX_FILE_BYTES = 1_000_000

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
const BARE_BASE64 = /^[A-Za-z0-9+/=]+$/

/** A screenshot given as a data URL, or as bare base64 text (the Shortcut's "Base64 Encode" gives that), which is taken to be a JPEG. */
const imageSchema = z
  .string()
  .max(MAX_IMAGE_CHARS)
  .transform((value) => (BARE_BASE64.test(value) ? `data:image/jpeg;base64,${value}` : value))
  .refine((value) => DATA_URL.test(value))

const requestSchema = z.object({ images: z.array(imageSchema).min(1).max(MAX_CHAT_IMAGES) })

const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** The screenshots in a request: a JSON list (the app) or one image sent as the file itself (the Shortcut). */
async function readImages(req: Request): Promise<string[] | null> {
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type.startsWith('image/')) {
    if (!MEDIA_TYPES.has(type)) return null
    const bytes = new Uint8Array(await req.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) return null
    return [`data:${type};base64,${Buffer.from(bytes).toString('base64')}`]
  }
  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  return parsed.success ? parsed.data.images : null
}

/**
 * Catch me up: reads screenshots of a chat and returns who said what, a short summary and what is being asked.
 * Nothing is stored: the screenshots and the messages exist only for this request, because they hold other people's words.
 * The app calls it with its sign-in cookie; the iPhone Shortcut calls it with its access token.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed.')
  const session = await requireUserOrShortcut(req)
  if (!session.ok) return session.response
  const { user } = session

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return errorResponse(500, 'Server is not configured.')

  const images = await readImages(req)
  if (!images) return errorResponse(400, `Send between 1 and ${MAX_CHAT_IMAGES} chat screenshots (JPEG, PNG or WebP), each under 1 MB.`)
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
  return json<{ catchUp: CatchUp; readout: string }>({ catchUp: result.catchUp, readout: readoutOf(result.catchUp) })
}

export const config: Config = { path: '/api/read-chat' }
