import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { PRICE_LIMITS, serviceInputSchema, type Service } from '../../src/types/pricing.ts'
import { planLimits } from '../../src/types/plans.ts'
import { encryptText, openText } from './_lib/crypto.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

interface ServiceRow {
  id: string
  name: string
  price: string
  note: string
}

const toService = (userId: string, row: ServiceRow): Service => ({
  id: row.id,
  name: openText(userId, 'services.name', row.name),
  price: openText(userId, 'services.price', row.price),
  note: openText(userId, 'services.note', row.note),
})

/** The price list used when writing quotes. Routes: /api/services and /api/services/:id. Reading and deleting always work; adding needs Basic. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const userId = session.user.id
  const sql = neon(process.env.DATABASE_URL ?? '')
  const id = new URL(req.url).pathname.split('/').filter(Boolean)[2]?.replace(/\.html?$/, '')

  try {
    if (req.method === 'GET' && !id) {
      const rows = (await sql.query('SELECT id, name, price, note FROM services WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, PRICE_LIMITS.items])) as ServiceRow[]
      return json<{ services: Service[] }>({ services: rows.map((row) => toService(userId, row)) })
    }

    if (req.method === 'POST' && !id) {
      if (!planLimits(session.user.plan).priceList) return upgradeResponse('The price list is part of the Basic plan.', 'basic')
      const input = serviceInputSchema.safeParse(await req.json().catch(() => null))
      if (!input.success) return errorResponse(400, 'Give the item and its price.')
      const [{ total }] = (await sql.query('SELECT count(*)::int AS total FROM services WHERE user_id = $1', [userId])) as { total: number }[]
      if (total >= PRICE_LIMITS.items) return errorResponse(409, `The price list holds ${PRICE_LIMITS.items} items. Delete one first.`)
      const [row] = (await sql.query('INSERT INTO services (user_id, name, price, note) VALUES ($1, $2, $3, $4) RETURNING id, name, price, note', [
        userId,
        encryptText(userId, 'services.name', input.data.name),
        encryptText(userId, 'services.price', input.data.price),
        encryptText(userId, 'services.note', input.data.note),
      ])) as ServiceRow[]
      return json<Service>(toService(userId, row), 201)
    }

    if (req.method === 'DELETE' && id) {
      if (!z.uuid().safeParse(id).success) return errorResponse(400, 'Invalid id.')
      const rows = await sql.query('DELETE FROM services WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])
      return rows.length > 0 ? json({ id }) : errorResponse(404, 'That item was not found.')
    }

    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Services request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your price list. Please try again.')
  }
}

export const config: Config = { path: ['/api/services', '/api/services/*'] }
