import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { planLimits } from '../../src/types/plans.ts'
import { expenseInputSchema, type Expense } from '../../src/types/scan.ts'
import { createExpense, deleteExpense, listExpenses } from './_lib/expense-store.ts'
import { errorResponse, json, upgradeResponse } from './_lib/http.ts'
import { describeError } from './_lib/safe-log.ts'
import { requireUser } from './_lib/session.ts'

/** The person's expenses (from scanned receipts or typed in). Routes: /api/expenses and /api/expenses/:id. Part of the Pro plan. */
export default async function handler(req: Request): Promise<Response> {
  const session = await requireUser(req)
  if (!session.ok) return session.response
  if (!planLimits(session.user.plan).business) return upgradeResponse('Expenses are part of the Pro plan.', 'pro')
  const userId = session.user.id
  const id = new URL(req.url).pathname.split('/').filter(Boolean)[2]?.replace(/\.html?$/, '') ?? null

  try {
    if (req.method === 'GET' && id === null) return json<{ expenses: Expense[] }>({ expenses: await listExpenses(userId) })
    if (req.method === 'POST' && id === null) {
      const input = expenseInputSchema.safeParse(await req.json().catch(() => null))
      if (!input.success) return errorResponse(400, 'An expense needs a supplier, a date and a total.')
      const result = await createExpense(userId, input.data)
      return result.ok ? json<Expense>(result.expense, 201) : errorResponse(409, result.message)
    }
    if (req.method === 'DELETE' && id !== null) {
      if (!z.uuid().safeParse(id).success) return errorResponse(400, 'Invalid id.')
      return (await deleteExpense(userId, id)) ? json({ id }) : errorResponse(404, 'That expense was not found.')
    }
    return errorResponse(405, 'Method not allowed.')
  } catch (err) {
    console.error('Expense request failed:', describeError(err))
    return errorResponse(500, 'Could not reach your expenses. Please try again.')
  }
}

export const config: Config = { path: ['/api/expenses', '/api/expenses/*'] }
