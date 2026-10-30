import type { Draft, DraftCategory, GeneratedDraft } from './draft.ts'
import type { PlanId } from './plans.ts'

export interface ApiError {
  error: string
  /** Set when the refusal is about the plan: the plan that would allow it, so the app can offer the upgrade. */
  upgrade?: PlanId
}

export interface TranscribeResponse {
  text: string
}

export interface ListDraftsResponse {
  drafts: Draft[]
  /** Older drafts kept but not shown because the plan's history is capped. */
  hidden?: number
}

export interface SaveDraftResponse {
  draft: Draft
}

export interface GenerateRequest {
  transcript: string
  /** The channel the user chose before recording; it decides the style of the draft. */
  category: DraftCategory
  /** Language to write the draft in: a code from languages.ts, or "same" (the default) to match what was spoken. */
  writeLanguage?: string
  /** Language being spoken, or "auto". Only a hint for the writer; transcription has its own setting. */
  spokenLanguage?: string
  /** Rewrite the draft in a different tone (Pro): a key from tones.ts. */
  tone?: string
}

export interface GenerateResponse {
  draft: GeneratedDraft
}
