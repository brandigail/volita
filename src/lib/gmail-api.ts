import { z } from 'zod'
import type { GmailLogEntry, PendingEmail } from '../types/gmail'
import { ApiRequestError, request } from './api'

// The waiting email, sending it and the record work the same whichever email service is connected (see mail-api.ts).

const pendingSchema = z.object({
  id: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  differs: z.boolean(),
  replyToSubject: z.string().nullable(),
  expiresAt: z.string(),
})

const logSchema = z.object({
  entries: z.array(z.object({ id: z.number(), action: z.enum(['connect', 'disconnect', 'search', 'read', 'prepare', 'send', 'cancel']), detail: z.string(), createdAt: z.string() })),
})

const unexpected = () => new ApiRequestError(502, 'The server sent an unexpected response.')
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function fetchPendingEmail(): Promise<PendingEmail | null> {
  const data = z.object({ pending: pendingSchema.nullable() }).safeParse(await request('/api/gmail/pending', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data.pending
}

/** Sends the email the person approved. Only ever called from a tap on Send or the spoken "send it". */
export async function sendPendingEmail(id: string): Promise<{ to: string }> {
  const data = z.object({ sent: z.literal(true), to: z.string() }).safeParse(await request('/api/gmail/send', post({ id })))
  if (!data.success) throw unexpected()
  return { to: data.data.to }
}

export async function cancelPendingEmail(id: string): Promise<void> {
  await request('/api/gmail/cancel', post({ id }))
}

export async function fetchGmailLog(): Promise<GmailLogEntry[]> {
  const data = logSchema.safeParse(await request('/api/gmail/log', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data.entries
}
