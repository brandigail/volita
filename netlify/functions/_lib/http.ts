import type { ApiError } from '../../../src/types/api.ts'
import type { PlanId } from '../../../src/types/plans.ts'

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function errorResponse(status: number, error: string): Response {
  return json<ApiError>({ error }, status)
}

/** Sent by the app's wake-up requests. Netlify turns HEAD into GET, so a header is the reliable signal. */
export const WARM_UP_HEADER = 'x-volita-warmup'

/**
 * The app sends a request with the warm-up header to a function just to wake it (see warmUp in assistant-api.ts).
 * It answers 204 at once, before any sign-in or quota work, so the wake-up costs nothing and never shows as an error
 * in the browser console.
 */
export function warmUpResponse(req: Request): Response | null {
  return req.headers.has(WARM_UP_HEADER) ? new Response(null, { status: 204 }) : null
}

/** A refusal because the person's plan does not include this; `needs` is the plan that does, so the app can offer it. */
export function upgradeResponse(message: string, needs: PlanId, status = 402): Response {
  return json<ApiError>({ error: message, upgrade: needs }, status)
}
