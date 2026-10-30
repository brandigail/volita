import type { ApiError } from '../../../src/types/api.ts'
import type { PlanId } from '../../../src/types/plans.ts'

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function errorResponse(status: number, error: string): Response {
  return json<ApiError>({ error }, status)
}

/** A refusal because the person's plan does not include this; `needs` is the plan that does, so the app can offer it. */
export function upgradeResponse(message: string, needs: PlanId, status = 402): Response {
  return json<ApiError>({ error: message, upgrade: needs }, status)
}
