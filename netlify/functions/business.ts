import type { Config } from '@netlify/functions'
import { businessSettingsSchema, type BusinessSettings } from '../../src/types/business.ts'
import { planLimits } from '../../src/types/plans.ts'
import { getSettings, saveSettings } from './_lib/business-store.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

/** The business details printed on invoices: VAT, bank account, payment terms, review link. GET and PUT /api/business. Part of the Pro plan. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  if (!planLimits(session.user.plan).business) return upgradeResponse('The Business tab is part of the Pro plan.', 'pro')
  const userId = session.user.id

  try {
    if (req.method === 'GET') return json<BusinessSettings>(await getSettings(userId))
    if (req.method === 'PUT') {
      const input = businessSettingsSchema.safeParse(await req.json().catch(() => null))
      if (!input.success) return errorResponse(400, input.error.issues[0]?.message ?? 'Those details were not understood.')
      await saveSettings(userId, input.data)
      return json<BusinessSettings>(input.data)
    }
    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Business settings request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your business details. Please try again.')
  }
}

export const config: Config = { path: '/api/business' }
