import { z } from 'zod'
import type { MyReview, ReviewsResponse } from '../types/reviews'
import { ApiRequestError, request } from './api'

const listSchema = z.object({
  reviews: z.array(z.object({ id: z.string(), name: z.string(), rating: z.number(), comment: z.string(), createdAt: z.string() })),
  count: z.number(),
  average: z.number().nullable(),
})
const mineSchema = z.object({ review: z.object({ rating: z.number(), comment: z.string() }).nullable() })

const body = (method: string, data: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
const unexpected = () => new ApiRequestError(502, 'The server sent an unexpected response.')

export async function fetchReviews(): Promise<ReviewsResponse> {
  const data = listSchema.safeParse(await request('/api/reviews', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data
}

export async function fetchMyReview(): Promise<MyReview | null> {
  const data = mineSchema.safeParse(await request('/api/reviews?mine=1', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data.review
}

export async function saveReview(review: MyReview): Promise<void> {
  await request('/api/reviews', body('POST', review))
}

/** Removes the signed-in person's own review, or (owner only) the review with this id. */
export async function removeReview(id?: string): Promise<void> {
  await request('/api/reviews', body('DELETE', id ? { id } : {}))
}
