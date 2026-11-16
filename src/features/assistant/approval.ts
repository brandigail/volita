/**
 * Hearing "send it" out loud. Only the person's own words, turned into text on their device's turn, can approve the
 * email that is on the screen, and the words must be plain agreement: anything else is a normal question for the
 * assistant. A bare "yes" counts only straight after the assistant said an email is ready, so a "yes" to something
 * else a minute later never sends anything.
 */

export type Approval = 'send' | 'cancel' | null

function normalise(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const YES = '(?:yes|yeah|yep|yup|ok|okay|sure|alright)'
const SEND_WORDS = new RegExp(`^(?:${YES} )?(?:please )?(?:go ahead and )?send(?: it| that| the email| the reply| the mail| the message)?(?: off| now)?(?: please)?$`)
const GO_AHEAD = new RegExp(`^(?:${YES} )?(?:please )?(?:go ahead|do it)(?: please)?$`)
const BARE_YES = new RegExp(`^(?:${YES}|yes please|please do|that is good|thats good|that looks good|looks good|thats fine|that is fine)$`)
const CANCEL_ANYTIME = /^(?:cancel(?: it| that| the email| the reply)?|do not send(?: it| that)?|dont send(?: it| that)?|scrap (?:it|that)|discard(?: it| that)?)$/
const CANCEL_JUST_AFTER = /^(?:no|nope|no thanks|never mind|nevermind|stop)$/

/** `justAfterReady` is true when the assistant's last words were that the email is ready on the screen. */
export function classifyApproval(transcript: string, justAfterReady: boolean): Approval {
  const text = normalise(transcript)
  if (!text) return null
  if (SEND_WORDS.test(text) || GO_AHEAD.test(text)) return 'send'
  if (CANCEL_ANYTIME.test(text)) return 'cancel'
  if (justAfterReady && BARE_YES.test(text)) return 'send'
  if (justAfterReady && CANCEL_JUST_AFTER.test(text)) return 'cancel'
  return null
}
