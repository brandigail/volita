import type { Config } from '@netlify/functions'
import { errorResponse, json } from './_lib/http.ts'
import { requireUser } from './_lib/session.ts'
import { createShortcutToken, revokeShortcutToken, shortcutTokenStatus, type TokenStatus } from './_lib/shortcut-token.ts'

/**
 * The access token for the iPhone "Catch me up" Shortcut. Managed from Profile with the sign-in cookie only: a Shortcut's own
 * token can never be used to make another one. The token itself is returned once, when it is made.
 */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const { id } = session.user

  switch (req.method) {
    case 'GET':
      return json<TokenStatus>(await shortcutTokenStatus(id))
    case 'POST': {
      const token = await createShortcutToken(id)
      return json<{ token: string }>({ token })
    }
    case 'DELETE':
      await revokeShortcutToken(id)
      return json<TokenStatus>({ exists: false, createdAt: null, lastUsedAt: null })
    default:
      return errorResponse(405, 'Method not allowed.')
  }
}

export const config: Config = { path: '/api/shortcut-token' }
