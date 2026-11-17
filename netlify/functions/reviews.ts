import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { MAX_REVIEW_CHARS, type MyReview, type PublicReview, type ReviewsResponse } from '../../src/types/reviews.ts'
import { errorResponse, json } from './_lib/http.ts'
import { claimQuota } from './_lib/rate-limit.ts'
import { refuseSensitive } from './_lib/safety.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

const SHOWN = 50

const bodySchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(MAX_REVIEW_CHARS).default('') })
const removeSchema = z.object({ id: z.uuid() })

interface ReviewRow {
  id: string
  rating: number
  comment: string
  created_at: string | Date
  name: string
}

/** Only the first name is shown, whatever the person typed as their name. */
const firstName = (name: string): string => (name.trim().split(/\s+/)[0] ?? '').slice(0, 30) || 'A Volita user'

function fromThisSite(req: Request): boolean {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return false
  const origin = req.headers.get('origin')
  return origin === null || origin === new URL(req.url).origin
}

/** Anyone can read the reviews (they are on the public landing page), so this needs no sign-in. */
async function list(): Promise<Response> {
  const sql = neon(process.env.DATABASE_URL ?? '')
  const [found, counted] = await Promise.all([
    sql.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.name FROM reviews r JOIN "user" u ON u.id = r.user_id
       WHERE u."suspendedAt" IS NULL ORDER BY r.created_at DESC LIMIT ${SHOWN}`,
    ),
    sql.query('SELECT count(*)::int AS count, avg(rating)::float AS average FROM reviews'),
  ])
  const rows = found as ReviewRow[]
  const totals = counted as { count: number; average: number | null }[]
  const reviews: PublicReview[] = rows.map((row) => ({ id: row.id, name: firstName(row.name), rating: row.rating, comment: row.comment, createdAt: new Date(row.created_at).toISOString() }))
  const total = totals[0]
  return json<ReviewsResponse>({ reviews, count: total?.count ?? 0, average: total?.average == null ? null : Math.round(total.average * 10) / 10 })
}

/** Routes: GET /api/reviews (public), GET /api/reviews?mine=1, POST /api/reviews (save or change mine), DELETE /api/reviews (mine, or any one for the owner). */
export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === 'GET' && new URL(req.url).searchParams.get('mine') !== '1') return await list()

    const session = await requireUser(req)
    if (!session.ok) return session.response
    const { user } = session
    const sql = neon(process.env.DATABASE_URL ?? '')

    if (req.method === 'GET') {
      const [row] = (await sql.query('SELECT rating, comment FROM reviews WHERE user_id = $1', [user.id])) as MyReview[]
      return json<{ review: MyReview | null }>({ review: row ?? null })
    }

    if (!fromThisSite(req)) return errorResponse(400, 'That request did not come from the app.')

    if (req.method === 'POST') {
      const input = bodySchema.safeParse(await req.json().catch(() => null))
      if (!input.success) return errorResponse(400, `Choose 1 to 5 stars. Your comment can be up to ${MAX_REVIEW_CHARS} characters.`)
      const refused = await refuseSensitive(user, input.data.comment, 'review')
      if (refused) return refused
      const quota = await claimQuota(user, 'feedback')
      if (!quota.ok) return quota.response
      await sql.query(
        `INSERT INTO reviews (user_id, rating, comment) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()`,
        [user.id, input.data.rating, input.data.comment],
      )
      return json({ saved: true }, 201)
    }

    if (req.method === 'DELETE') {
      const body = await req.json().catch(() => null)
      const other = removeSchema.safeParse(body)
      if (other.success) {
        if (!user.isOwner) return errorResponse(403, 'Only the owner can remove other people’s reviews.')
        await sql.query('DELETE FROM reviews WHERE id = $1', [other.data.id])
      } else {
        await sql.query('DELETE FROM reviews WHERE user_id = $1', [user.id])
      }
      return json({ removed: true })
    }

    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Reviews request failed:', describeError(err))
    return errorResponse(500, 'Something went wrong with the reviews. Please try again.')
  }
}

export const config: Config = { path: '/api/reviews' }
