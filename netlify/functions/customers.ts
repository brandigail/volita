import type { Config } from '@netlify/functions'
import { z } from 'zod'
import type { CustomerStory, CustomerSummary } from '../../src/types/business.ts'
import { planLimits } from '../../src/types/plans.ts'
import { listInvoices } from './_lib/business-store.ts'
import { loadActivitySource, summarise, timelineFor } from './_lib/customer-timeline.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { listContacts } from './_lib/memory-store.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

/**
 * Customers with their story. GET /api/customers lists the people Volita knows with what each owes; GET /api/customers/:id
 * gives one person's timeline of messages, meetings and invoices. Read-only, and part of the Pro plan.
 */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  if (!planLimits(session.user.plan).business) return upgradeResponse('Customers with their story are part of the Pro plan.', 'pro')
  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed.')
  const userId = session.user.id
  const id = new URL(req.url).pathname.split('/').filter(Boolean)[2]?.replace(/\.html?$/, '') ?? null

  try {
    if (id !== null && !z.uuid().safeParse(id).success) return errorResponse(400, 'Invalid id.')
    const [contacts, invoices, source] = await Promise.all([listContacts(userId), listInvoices(userId), loadActivitySource(userId, new Date())])

    if (id !== null) {
      const contact = contacts.find((candidate) => candidate.id === id)
      if (!contact) return errorResponse(404, 'That customer was not found.')
      const timeline = timelineFor(contact, invoices, source)
      return json<CustomerStory>({ customer: summarise(contact, invoices, timeline), notes: contact.notes, timeline })
    }

    const customers = contacts.map((contact) => summarise(contact, invoices, timelineFor(contact, invoices, source)))
    // The people who owe money first, then the most recently dealt with.
    customers.sort((a, b) => b.owedCents - a.owedCents || (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name))
    return json<{ customers: CustomerSummary[] }>({ customers })
  } catch (err) {
    console.error('Customer request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your customers. Please try again.')
  }
}

export const config: Config = { path: ['/api/customers', '/api/customers/*'] }
