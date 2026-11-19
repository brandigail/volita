import { z } from 'zod'
import type { Profile } from '../types/profile'
import { ApiRequestError, request } from './api'

/** Asks for three friendly names Volita could call the owner, based on what the business does. */
export async function suggestNicknames(profile: Pick<Profile, 'name' | 'businessName' | 'businessAbout' | 'role'>): Promise<string[]> {
  const data = z
    .object({ names: z.array(z.string()) })
    .safeParse(await request('/api/nickname-ideas', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }))
  if (!data.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
  return data.data.names
}
