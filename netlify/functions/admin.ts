import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import { z } from 'zod'
import type { AdminUser, AdminUsersResponse } from '../../src/types/plan-state.ts'
import { PLAN_RANK, isPlanId } from '../../src/types/plans.ts'
import { errorResponse, json } from './_lib/http.ts'
import { isOwner } from './_lib/plan.ts'
import { requireUser } from './_lib/session.ts'
import { describeError } from './_lib/safe-log.ts'

interface UserRow {
  id: string
  email: string
  name: string
  created_at: string | Date
  granted: string | null
  subscribed: string | null
  drafts: number
  last_active: string | Date | null
}

const SELECT_USERS = `
  SELECT u.id, u.email, u.name, u."createdAt" AS created_at, COALESCE(g.plan, i.plan) AS granted, s.plan AS subscribed,
    (SELECT count(*) FROM drafts d WHERE d.user_id = u.id)::int AS drafts,
    (SELECT max(a.created_at) FROM api_usage a WHERE a.user_id = u.id) AS last_active
  FROM "user" u
  LEFT JOIN plan_grants g ON g.user_id = u.id
  LEFT JOIN plan_invites i ON i.email = lower(u.email)
  LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'`

const updateSchema = z.object({ plan: z.enum(['free', 'basic', 'pro']) })
/** Emails pasted one per line or separated by commas or spaces; each becomes a plan waiting for that person to sign up. */
const inviteSchema = z.object({ emails: z.string().max(5_000), plan: z.enum(['basic', 'pro']) })
const removeInviteSchema = z.object({ email: z.string().max(200) })
const MAX_INVITES = 200

function toAdminUser(row: UserRow): AdminUser {
  const granted = isPlanId(row.granted) ? row.granted : null
  const subscribed = isPlanId(row.subscribed) ? row.subscribed : null
  let plan: AdminUser['plan'] = 'free'
  let source: AdminUser['source'] = 'default'
  if (isOwner(row.email)) {
    plan = 'pro'
    source = 'owner'
  } else if (granted && (!subscribed || PLAN_RANK[granted] >= PLAN_RANK[subscribed])) {
    plan = granted
    source = 'grant'
  } else if (subscribed) {
    plan = subscribed
    source = 'subscription'
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
    plan,
    source,
    drafts: row.drafts,
    lastActive: row.last_active ? new Date(row.last_active).toISOString() : null,
  }
}

/** The family screen: only the owner can list every account and choose who gets a plan for free. Routes: /api/admin/users and /api/admin/users/:id. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  if (!session.user.isOwner) return errorResponse(403, 'Only the owner can use this.')

  const sql = neon(process.env.DATABASE_URL ?? '')
  const segments = new URL(req.url).pathname.split('/').filter(Boolean)
  const id = segments[3]

  try {
    if (segments[2] === 'invites') return await handleInvites(req, sql, session.user.email)

    if (req.method === 'GET' && !id) {
      const rows = (await sql.query(`${SELECT_USERS} ORDER BY u."createdAt" DESC LIMIT 200`)) as UserRow[]
      return json<AdminUsersResponse>({ users: rows.map(toAdminUser) })
    }

    if (req.method === 'PUT' && id) {
      const parsed = updateSchema.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return errorResponse(400, 'Choose free, basic or pro.')
      const [target] = (await sql.query('SELECT email FROM "user" WHERE id = $1', [id])) as { email: string }[]
      if (!target) return errorResponse(404, 'That account was not found.')
      if (isOwner(target.email)) return errorResponse(400, 'Owner accounts always have Pro.')
      if (parsed.data.plan === 'free') {
        await sql.query('DELETE FROM plan_grants WHERE user_id = $1', [id])
        await sql.query('DELETE FROM plan_invites WHERE email = lower($1)', [target.email])
      } else {
        await sql.query(
          `INSERT INTO plan_grants (user_id, plan, granted_by, note) VALUES ($1, $2, $3, 'Set by the owner')
           ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, granted_by = EXCLUDED.granted_by, updated_at = now()`,
          [id, parsed.data.plan, session.user.email],
        )
      }
      const [row] = (await sql.query(`${SELECT_USERS} WHERE u.id = $1`, [id])) as UserRow[]
      return json<{ user: AdminUser }>({ user: toAdminUser(row) })
    }

    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Admin request failed:', describeError(err))
    return errorResponse(500, 'Could not reach the accounts. Please try again.')
  }
}

interface InviteRow {
  email: string
  plan: string
  created_at: string | Date
  signed_up: boolean
}

async function handleInvites(req: Request, sql: NeonQueryFunction<false, false>, ownerEmail: string): Promise<Response> {
  if (req.method === 'GET') {
    const rows = (await sql.query(
      `SELECT i.email, i.plan, i.created_at, EXISTS (SELECT 1 FROM "user" u WHERE lower(u.email) = i.email) AS signed_up
       FROM plan_invites i ORDER BY i.created_at DESC LIMIT ${MAX_INVITES}`,
    )) as InviteRow[]
    return json({ invites: rows.map((row) => ({ email: row.email, plan: row.plan, createdAt: new Date(row.created_at).toISOString(), signedUp: row.signed_up })) })
  }

  if (req.method === 'POST') {
    const input = inviteSchema.safeParse(await req.json().catch(() => null))
    if (!input.success) return errorResponse(400, 'Paste some email addresses and choose Basic or Pro.')
    const emails = [...new Set(input.data.emails.toLowerCase().split(/[\s,;]+/).filter(Boolean))]
    const valid = emails.filter((email) => z.email().safeParse(email).success)
    const invalid = emails.filter((email) => !valid.includes(email))
    if (valid.length === 0) return errorResponse(400, 'No valid email addresses found.')
    const [{ total }] = (await sql.query('SELECT count(*)::int AS total FROM plan_invites')) as { total: number }[]
    if (total + valid.length > MAX_INVITES) return errorResponse(409, `You can keep ${MAX_INVITES} invitations. Remove some first.`)
    for (const email of valid) {
      await sql.query(
        `INSERT INTO plan_invites (email, plan, created_by) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET plan = EXCLUDED.plan`,
        [email, input.data.plan, ownerEmail],
      )
    }
    return json({ added: valid.length, invalid }, 201)
  }

  if (req.method === 'DELETE') {
    const input = removeInviteSchema.safeParse(await req.json().catch(() => null))
    if (!input.success) return errorResponse(400, 'Choose an invitation to remove.')
    await sql.query('DELETE FROM plan_invites WHERE email = lower($1)', [input.data.email])
    return json({ removed: true })
  }

  return errorResponse(405, 'Method not allowed.')
}

export const config: Config = { path: ['/api/admin/users', '/api/admin/users/*', '/api/admin/invites'] }
