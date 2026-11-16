// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.
import { isAdult } from './age.ts'

/**
 * The version of the terms of use. Everyone must go through every part and accept this exact version before they can
 * use Volita. Change it whenever the terms change in a way that matters, and every account goes through them again.
 */
export const TERMS_VERSION = '2026-11-16'

export const TERMS_NEEDED_MESSAGE = 'Please go through the terms of use and accept them to carry on.'

/** An account may use the app once it has given a date of birth showing 18 or over and accepted the current terms. */
export function accountReady(user: { birthDate?: unknown; termsVersion?: unknown } | null | undefined): boolean {
  return Boolean(user) && isAdult(user?.birthDate) && user?.termsVersion === TERMS_VERSION
}
