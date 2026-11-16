import { z } from 'zod'
import type { GmailLogEntry, GmailStatus, PendingEmail } from '../types/gmail'
import { ApiRequestError, request } from './api'

const statusSchema = z.object({
  configured: z.boolean(),
  allowed: z.boolean(),
  connected: z.boolean(),
  email: z.string().nullable(),
  needsReconnect: z.boolean(),
  connectedAt: z.string().nullable(),
})

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

/** Opening this address (a real page visit, not a fetch) takes the person to Google's permission screen. */
export const GMAIL_CONNECT_URL = '/api/gmail/start'

export async function fetchGmailStatus(): Promise<GmailStatus> {
  const data = statusSchema.safeParse(await request('/api/gmail/status', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data
}

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

export async function disconnectGmail(): Promise<void> {
  await request('/api/gmail/disconnect', post({}))
}

export async function fetchGmailLog(): Promise<GmailLogEntry[]> {
  const data = logSchema.safeParse(await request('/api/gmail/log', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data.entries
}
