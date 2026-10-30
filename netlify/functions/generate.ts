import type { GenerateResponse } from '../../src/types/api.ts'
import { generateRequestSchema } from '../../src/types/draft-schema.ts'
import { planForChannel, planLimits } from '../../src/types/plans.ts'
import { writeDraft } from './_lib/draft-generator.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { loadMemoryContext } from './_lib/memory-context.ts'
import { loadPriceContext } from './_lib/price-context.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { requireUser } from './_lib/session.ts'
import { logActivity } from './_lib/activity.ts'
import { AUTO, SAME } from '../../src/types/languages.ts'

/** Netlify's default function timeout is 10 s; the whole call, retry included, must fit inside it. */
const DEADLINE_MS = 9_000

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed.')

  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { user } = session

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('GROQ_API_KEY is not configured')
    return errorResponse(500, 'Server is not configured.')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'Send a JSON body.')
  }
  const request = generateRequestSchema.safeParse(body)
  if (!request.success) return errorResponse(400, 'A transcript of 1 to 10,000 characters is required.')

  const { category, transcript, writeLanguage, spokenLanguage, tone } = request.data
  const limits = planLimits(user.plan)
  if (!limits.channels.includes(category)) {
    return upgradeResponse(`${category.charAt(0)}${category.slice(1).toLowerCase()} drafts are part of the Basic plan.`, planForChannel(category))
  }
  const otherWrite = writeLanguage !== undefined && writeLanguage !== SAME && writeLanguage !== 'en'
  const otherSpoken = spokenLanguage !== undefined && spokenLanguage !== AUTO && spokenLanguage !== 'en'
  if (!limits.anyLanguage && (otherWrite || otherSpoken)) {
    return upgradeResponse('Other languages and translation are part of the Basic plan. Free drafts are in English.', 'basic')
  }
  if (tone !== undefined && !limits.toneRewrite) return upgradeResponse('Rewriting in a different tone is part of the Pro plan.', 'pro')

  const quota = await claimQuota(user, 'generate')
  if (!quota.ok) return quota.response

  const result = await writeDraft({
    apiKey,
    category,
    transcript,
    profile: user.profile,
    deadlineMs: DEADLINE_MS,
    writeLanguage,
    spokenLanguage,
    tone,
    footer: limits.footer,
    // Locked memory (Free, or a downgraded account) is kept but not used.
    memory: limits.memoryItems === 0 ? '' : await loadMemoryContext(user.id, transcript),
    prices: category === 'QUOTE' ? await loadPriceContext(user.id, user.plan) : undefined,
  })
  if (!result.ok) {
    await logActivity(user, 'draft_failed', { category, status: result.status, message: result.message, transcript })
    return errorResponse(result.status, result.message)
  }
  await logActivity(user, 'draft_written', { category, writeLanguage, spokenLanguage, transcript, draft: result.draft })
  return json<GenerateResponse>({ draft: result.draft })
}
