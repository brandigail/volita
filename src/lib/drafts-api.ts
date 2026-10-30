import { z } from 'zod'
import type { Draft, DraftStatusUpdate, SaveDraftInput } from '../types/draft'
import { draftSchema } from '../types/draft-schema'
import { ApiRequestError, request } from './api'

const listResponseSchema = z.object({ drafts: z.array(draftSchema), hidden: z.number().optional() })
const saveResponseSchema = z.object({ draft: draftSchema })

const unexpected = () => new ApiRequestError(502, 'The server sent an unexpected response.')

export interface DraftList {
  drafts: Draft[]
  /** Older drafts kept but not shown because the plan's history is capped. */
  hidden: number
}

export async function listDrafts(): Promise<DraftList> {
  const data = listResponseSchema.safeParse(await request('/api/drafts', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return { drafts: data.data.drafts, hidden: data.data.hidden ?? 0 }
}

/** Creates the draft, or updates it if the id already exists. */
export async function saveDraft(draft: SaveDraftInput): Promise<Draft> {
  const data = saveResponseSchema.safeParse(
    await request(`/api/drafts/${draft.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }),
  )
  if (!data.success) throw unexpected()
  return data.data.draft
}

/** Marks the draft as sent (or not) and/or plans when to send it. Anything left out is unchanged. */
export async function updateDraftStatus(id: string, update: DraftStatusUpdate): Promise<Draft> {
  const data = saveResponseSchema.safeParse(
    await request(`/api/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    }),
  )
  if (!data.success) throw unexpected()
  return data.data.draft
}

/** Records that the user sent the draft (or takes that back). */
export const markDraftSent = (id: string, sent: boolean) => updateDraftStatus(id, { sent })

export async function deleteDraft(id: string): Promise<void> {
  await request(`/api/drafts/${id}`, { method: 'DELETE' })
}
