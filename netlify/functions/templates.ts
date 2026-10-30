import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { TEMPLATE_LIMITS, templateInputSchema, type Template } from '../../src/types/pricing.ts'
import { planLimits } from '../../src/types/plans.ts'
import { encryptText, openText } from './_lib/crypto.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

interface TemplateRow {
  id: string
  title: string
  content: string
}

const toTemplate = (userId: string, row: TemplateRow): Template => ({
  id: row.id,
  title: openText(userId, 'templates.title', row.title),
  content: openText(userId, 'templates.content', row.content),
})

/** Saved phrases and messages. Routes: /api/templates and /api/templates/:id. Reading and deleting always work; adding needs Basic. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const userId = session.user.id
  const sql = neon(process.env.DATABASE_URL ?? '')
  const id = new URL(req.url).pathname.split('/').filter(Boolean)[2]?.replace(/\.html?$/, '')

  try {
    if (req.method === 'GET' && !id) {
      const rows = (await sql.query('SELECT id, title, content FROM templates WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, TEMPLATE_LIMITS.items])) as TemplateRow[]
      return json<{ templates: Template[] }>({ templates: rows.map((row) => toTemplate(userId, row)) })
    }

    if (req.method === 'POST' && !id) {
      if (!planLimits(session.user.plan).templates) return upgradeResponse('Saved templates are part of the Basic plan.', 'basic')
      const input = templateInputSchema.safeParse(await req.json().catch(() => null))
      if (!input.success) return errorResponse(400, `Give a title and the text (up to ${TEMPLATE_LIMITS.content} characters).`)
      const [{ total }] = (await sql.query('SELECT count(*)::int AS total FROM templates WHERE user_id = $1', [userId])) as { total: number }[]
      if (total >= TEMPLATE_LIMITS.items) return errorResponse(409, `You can keep ${TEMPLATE_LIMITS.items} templates. Delete one first.`)
      const [row] = (await sql.query('INSERT INTO templates (user_id, title, content) VALUES ($1, $2, $3) RETURNING id, title, content', [
        userId,
        encryptText(userId, 'templates.title', input.data.title),
        encryptText(userId, 'templates.content', input.data.content),
      ])) as TemplateRow[]
      return json<Template>(toTemplate(userId, row), 201)
    }

    if (req.method === 'DELETE' && id) {
      if (!z.uuid().safeParse(id).success) return errorResponse(400, 'Invalid id.')
      const rows = await sql.query('DELETE FROM templates WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])
      return rows.length > 0 ? json({ id }) : errorResponse(404, 'That template was not found.')
    }

    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Templates request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your templates. Please try again.')
  }
}

export const config: Config = { path: ['/api/templates', '/api/templates/*'] }
