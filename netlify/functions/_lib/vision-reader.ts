import type { z } from 'zod'
import { chat, type ChatMessage } from './groq-chat.ts'

/** Don't start a retry with less time than this left. */
const MIN_RETRY_MS = 3_000
const MAX_ATTEMPTS = 2

export type VisionResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string }

export interface VisionRequest<T> {
  apiKey: string
  /** A JPEG, PNG or WebP data URL. */
  image: string
  system: string
  /** What to do with the picture, as the user message beside it. */
  instruction: string
  schema: z.ZodType<T, unknown>
  /** What to call the thing in an error ("that business card"). */
  subject: string
  /** Time the whole call, retry included, may take. */
  deadlineMs: number
}

/** Models sometimes wrap JSON in a code fence even in JSON mode; take what is between the outer braces. */
function extractJson(content: string): string {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  return start >= 0 && end > start ? content.slice(start, end + 1) : content
}

/** Parses the model's reply against the schema. Exported so it can be tested without the model. */
export function parseReading<T>(schema: z.ZodType<T, unknown>, content: string): { ok: true; value: T } | { ok: false; problem: string } {
  let raw: unknown
  try {
    raw = JSON.parse(extractJson(content))
  } catch {
    return { ok: false, problem: 'it was not valid JSON' }
  }
  const result = schema.safeParse(raw)
  if (result.success) return { ok: true, value: result.data }
  return { ok: false, problem: result.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ') }
}

/**
 * Reads one picture with the vision model and returns what the schema asks for, retrying once if the reply is not valid. Nothing about
 * the picture is kept: it exists only for this call.
 */
export async function readStructured<T>({ apiKey, image, system, instruction, schema, subject, deadlineMs }: VisionRequest<T>): Promise<VisionResult<T>> {
  const startedAt = Date.now()
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        { type: 'text', text: instruction },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ]

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remaining = deadlineMs - (Date.now() - startedAt)
    if (attempt > 0 && remaining < MIN_RETRY_MS) break

    const result = await chat(apiKey, messages, remaining, { json: true, temperature: 0 })
    if (!result.ok) {
      if (result.status === 429) return { ok: false, status: 429, message: 'The AI service is busy. Try again in a moment.' }
      return { ok: false, status: result.status === 504 ? 504 : 502, message: `Could not read ${subject}. Please try again.` }
    }
    const parsed = parseReading(schema, result.content)
    if (parsed.ok) return parsed
    console.error(`Invalid reading of ${subject} from model:`, parsed.problem)
    messages.push({ role: 'assistant', content: result.content }, { role: 'user', content: `That was not usable: ${parsed.problem}. Reply again with only the JSON object described.` })
  }
  return { ok: false, status: 502, message: `Could not make sense of ${subject}. Try a clearer, closer photo.` }
}
