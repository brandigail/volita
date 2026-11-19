import { z } from 'zod'
import { ApiRequestError, request } from './api'

const statusSchema = z.object({ exists: z.boolean(), createdAt: z.string().nullable(), lastUsedAt: z.string().nullable() })
export type ShortcutStatus = z.infer<typeof statusSchema>

const unexpected = () => new ApiRequestError(502, 'The server sent an unexpected response.')

export async function fetchShortcutStatus(): Promise<ShortcutStatus> {
  const data = statusSchema.safeParse(await request('/api/shortcut-token', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data
}

/** Makes a new access code (the old one stops working). The code is returned only this once. */
export async function createShortcutToken(): Promise<string> {
  const data = z.object({ token: z.string() }).safeParse(await request('/api/shortcut-token', { method: 'POST' }))
  if (!data.success) throw unexpected()
  return data.data.token
}

export async function revokeShortcutToken(): Promise<void> {
  await request('/api/shortcut-token', { method: 'DELETE' })
}
