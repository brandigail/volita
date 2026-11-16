import { findSensitive, sensitiveMessage } from './sensitive'
import type { RefusalCode } from '../types/safety'

/**
 * Safety refusals travel to one pop-up for the whole app (SafetyNotice). The server sends them for text with protected
 * details, a closed account or a missing date of birth; the app sends its own before sharing a draft with protected details.
 */

export interface Refusal {
  code: RefusalCode
  message: string
}

const EVENT = 'volita:refusal'

export function announceRefusal(refusal: Refusal): void {
  window.dispatchEvent(new CustomEvent<Refusal>(EVENT, { detail: refusal }))
}

export function onRefusal(listener: (refusal: Refusal) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<Refusal>).detail)
  window.addEventListener(EVENT, handle)
  return () => window.removeEventListener(EVENT, handle)
}

/**
 * For actions that leave Volita (copy, share, open in the mail or SMS app): true when the text is fine. Otherwise it
 * shows the pop-up and returns false, so the action stops.
 */
export function clearToShare(text: string): boolean {
  const kinds = findSensitive(text)
  if (kinds.length === 0) return true
  announceRefusal({ code: 'sensitive', message: sensitiveMessage(kinds).replace('Please say it again without them.', 'Please take them out of the draft first.') })
  return false
}
