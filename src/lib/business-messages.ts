import type { Invoice } from '../types/business'
import type { Profile } from '../types/profile'
import { addDaysTo, daysBetween, formatRand, type ChaseStage } from './money'
import { prettyDate } from './invoice-text'
import { buildSignature } from './profile'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/**
 * These messages are written from fixed wording rather than by the AI: it costs nothing, is the same every time, can never make up a
 * threat or a legal claim, and the owner reads and edits the text before anything is sent. The banking details are never put in the
 * message: they are on the invoice.
 */

/**
 * A payment reminder saved to History carries `chase:<invoice id>` as its original request, so that marking it sent counts it against
 * the invoice (see db-sync). The id is in the saved text only; nothing else about the invoice is.
 */
export const CHASE_MARKER = /^chase:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

export const chaseMarkerFor = (invoiceId: string): string => `chase:${invoiceId}`

export interface BusinessMessage {
  subject: string
  body: string
}

const SUBJECT: Record<ChaseStage, string> = {
  1: 'Reminder',
  2: 'Second reminder',
  3: 'Final reminder',
}

/** The payment reminder for an invoice: friendly after 7 days, firmer after 14, a clear last one after 30. `today` is YYYY-MM-DD. */
export function chaserMessage(stage: ChaseStage, invoice: Invoice, profile: Profile, today: string): BusinessMessage {
  const late = Math.max(0, daysBetween(invoice.dueOn, today))
  const amount = formatRand(invoice.totalCents)
  const due = prettyDate(invoice.dueOn)
  const payBy = prettyDate(addDaysTo(today, 3))
  const reference = `Please use ${invoice.number} as the payment reference, and the banking details are on the invoice.`
  const intro = `Hi ${invoice.customerName},`

  const middle: Record<ChaseStage, string> = {
    1: `Just a friendly reminder that invoice ${invoice.number} for ${amount} was due on ${due} and I have not seen the payment yet. If you have already paid, please send me the proof of payment and ignore this message.`,
    2: `Invoice ${invoice.number} for ${amount} is now ${late} days overdue (it was due on ${due}). Could you please pay it by ${payBy}, or let me know when I can expect it?`,
    3: `This is my final reminder about invoice ${invoice.number} for ${amount}, now ${late} days overdue. Please pay it by ${payBy}. If something is wrong, please phone me so we can sort it out.`,
  }

  return {
    subject: `${SUBJECT[stage]}: invoice ${invoice.number}`,
    body: [intro, middle[stage], reference, 'Thank you.', buildSignature(profile)].join('\n\n'),
  }
}

/** Asks a happy customer for a Google review. Needs the owner's review link, which goes in the message exactly as saved. */
export function reviewMessage(customerName: string, reviewLink: string, profile: Profile): BusinessMessage {
  const business = profile.businessName || profile.name || 'us'
  return {
    subject: `Thank you from ${business}`,
    body: [
      `Hi ${customerName},`,
      `Thank you for choosing ${business}! If you were happy with the work, would you mind leaving a quick Google review? It takes a minute and helps a small business like ours a lot:`,
      reviewLink,
      'Thank you!',
      buildSignature(profile),
    ].join('\n\n'),
  }
}
