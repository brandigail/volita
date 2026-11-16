import { z } from 'zod'
import type { MailProviderId, MailStatus } from '../types/mail'
import { ApiRequestError, request } from './api'

const providerSchema = z.enum(['gmail', 'outlook', 'yahoo', 'aol', 'icloud', 'zoho', 'other'])

const statusSchema = z.object({
  allowed: z.boolean(),
  connected: z.boolean(),
  provider: providerSchema.nullable(),
  email: z.string().nullable(),
  needsReconnect: z.boolean(),
  connectedAt: z.string().nullable(),
  googleReady: z.boolean(),
  microsoftReady: z.boolean(),
})

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Opening these addresses (a real page visit, not a fetch) takes the person to Google's or Microsoft's permission screen. */
export const GMAIL_CONNECT_URL = '/api/gmail/start'
export const OUTLOOK_CONNECT_URL = '/api/mail/outlook/start'

export async function fetchMailStatus(): Promise<MailStatus> {
  const data = statusSchema.safeParse(await request('/api/mail/status', { method: 'GET' }))
  if (!data.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
  return data.data
}

export interface PasswordConnection {
  provider: Exclude<MailProviderId, 'gmail' | 'outlook'>
  email: string
  password: string
  /** Only for "other": the server names from the person's email company. */
  imap?: { host: string; port: number }
  smtp?: { host: string; port: number }
}

/** Tries the details with the email company and saves them only if both reading and sending work. */
export async function connectPasswordMail(connection: PasswordConnection): Promise<void> {
  await request('/api/mail/connect', post(connection))
}

export async function disconnectMail(): Promise<void> {
  await request('/api/mail/disconnect', post({}))
}
