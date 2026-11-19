import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { INVOICE_STATUSES, invoiceInputSchema, invoicePatchSchema, type Invoice, type InvoicesResponse } from '../../src/types/business.ts'
import { planLimits } from '../../src/types/plans.ts'
import { createInvoice, deleteDraftInvoice, getInvoice, getSettings, listInvoices, patchInvoice } from './_lib/business-store.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

const today = () => new Date().toISOString().slice(0, 10)

/** The person's invoices. Routes: /api/invoices and /api/invoices/:id. Part of the Pro plan. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  const userId = session.user.id
  if (!planLimits(session.user.plan).business) return upgradeResponse('Invoices are part of the Pro plan.', 'pro')
  const url = new URL(req.url)
  const id = url.pathname.split('/').filter(Boolean)[2]?.replace(/\.html?$/, '') ?? null

  try {
    if (id !== null && !z.uuid().safeParse(id).success) return errorResponse(400, 'Invalid id.')

    if (req.method === 'GET' && id === null) {
      const status = INVOICE_STATUSES.find((value) => value === url.searchParams.get('status'))
      return json<InvoicesResponse>({ invoices: await listInvoices(userId, status) })
    }

    if (req.method === 'GET' && id !== null) {
      const invoice = await getInvoice(userId, id)
      return invoice ? json<Invoice>(invoice) : errorResponse(404, 'That invoice was not found.')
    }

    if (req.method === 'POST' && id === null) {
      const input = invoiceInputSchema.safeParse(await req.json().catch(() => null))
      if (!input.success) return errorResponse(400, 'An invoice needs a customer name and at least one item with a price.')
      const result = await createInvoice(userId, input.data, await getSettings(userId), today())
      return result.ok ? json<Invoice>(result.invoice, 201) : errorResponse(409, result.message)
    }

    if (req.method === 'PATCH' && id !== null) {
      const patch = invoicePatchSchema.safeParse(await req.json().catch(() => null))
      if (!patch.success) return errorResponse(400, 'That change was not understood.')
      const result = await patchInvoice(userId, id, patch.data)
      return result.ok ? json<Invoice>(result.invoice) : errorResponse(result.status, result.message)
    }

    if (req.method === 'DELETE' && id !== null) {
      const result = await deleteDraftInvoice(userId, id)
      if (result === 'deleted') return json({ id })
      return result === 'sent' ? errorResponse(409, 'Only a draft can be deleted. Cancel a sent invoice instead.') : errorResponse(404, 'That invoice was not found.')
    }

    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Invoice request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your invoices. Please try again.')
  }
}

export const config: Config = { path: ['/api/invoices', '/api/invoices/*'] }
