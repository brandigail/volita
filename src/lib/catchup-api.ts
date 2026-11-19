import { z } from 'zod'
import { catchUpSchema, type CatchUp } from '../types/catchup'
import { ApiRequestError, request } from './api'

/** Sends chat screenshots (JPEG data URLs, oldest first) and gets back who said what and a short summary. */
export async function readChatScreenshots(images: string[]): Promise<CatchUp> {
  const data = z.object({ catchUp: catchUpSchema }).safeParse(
    await request('/api/read-chat', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }) }),
  )
  if (!data.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
  return data.data.catchUp
}
