import { neon } from '@neondatabase/serverless'
import type { DraftCategory, GeneratedDraft } from '../../../src/types/draft.ts'
import { planLimits } from '../../../src/types/plans.ts'
import type { ToolContext } from './assistant-tools.ts'
import { writeDraft } from './draft-generator.ts'
import { encryptDraftText } from './draft-store.ts'
import { loadMemoryContext } from './memory-context.ts'
import { loadPriceContext } from './price-context.ts'

/** The most drafts one person may keep. */
const MAX_DRAFTS = 500

export type SavedDraft = { ok: true; id: string; draft: GeneratedDraft } | { ok: false; message: string }

export interface DraftToSave {
  category: DraftCategory
  /** What the draft is about, in the user's words (and any context such as the chat being answered). */
  instruction: string
  language?: string
  /** Used instead of what the writer put in the recipient line, for example a saved person's phone number. */
  recipient?: string
}

/** Saves a finished draft, encrypted, to the person's history. `transcript` is what it was made from; the history shows it as the original request. */
export async function saveDraftRow(userId: string, draft: GeneratedDraft, transcript: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const sql = neon(process.env.DATABASE_URL ?? '')
  const [{ total }] = (await sql.query('SELECT count(*)::int AS total FROM drafts WHERE user_id = $1', [userId])) as { total: number }[]
  if (total >= MAX_DRAFTS) return { ok: false, message: `The user already has ${MAX_DRAFTS} drafts, so nothing was saved. Ask them to delete some.` }
  const text = encryptDraftText(userId, { recipient: draft.recipient, subject: draft.subject, body: draft.body, transcript })
  const [saved] = (await sql.query(
    `INSERT INTO drafts (user_id, category, recipient, subject, body, transcript, language, original_body)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $5) RETURNING id`,
    [userId, draft.category, text.recipient, text.subject, text.body, text.transcript, draft.language],
  )) as { id: string }[]
  return { ok: true, id: saved.id }
}

/** Writes a draft for the user with the model and saves it, encrypted, to their history. The shared path for every tool that creates a draft. */
export async function writeAndSaveDraft(ctx: ToolContext, { category, instruction, language, recipient }: DraftToSave): Promise<SavedDraft> {
  const limits = planLimits(ctx.plan)
  const result = await writeDraft({
    apiKey: ctx.apiKey,
    category,
    transcript: instruction,
    profile: ctx.profile,
    deadlineMs: ctx.deadlineAt - Date.now(),
    writeLanguage: language,
    spokenLanguage: ctx.spokenLanguage,
    footer: limits.footer,
    memory: limits.memoryItems === 0 ? '' : await loadMemoryContext(ctx.userId, instruction),
    prices: category === 'QUOTE' ? await loadPriceContext(ctx.userId, ctx.plan) : undefined,
  })
  if (!result.ok) return { ok: false, message: result.message }

  const draft = recipient ? { ...result.draft, recipient } : result.draft
  const saved = await saveDraftRow(ctx.userId, draft, instruction)
  return saved.ok ? { ok: true, id: saved.id, draft } : saved
}
