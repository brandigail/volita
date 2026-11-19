import type { BusinessSettings, Invoice } from '../types/business'
import type { Profile } from '../types/profile'
import { formatRand } from './money'
import { toInternationalNumber } from './phone'

/** "19 Nov 2026" from a YYYY-MM-DD date, without the time zone shifting the day. */
export const prettyDate = (date: string): string =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

/** The message that goes with an invoice, short enough for WhatsApp. The invoice itself carries the bank details. */
export function invoiceMessage(invoice: Invoice, profile: Profile): string {
  const from = profile.businessName || profile.name
  return [
    `Hi ${invoice.customerName},`,
    `Here is invoice ${invoice.number} for ${formatRand(invoice.totalCents)}${invoice.vatCents > 0 ? ' (VAT included)' : ''}, due ${prettyDate(invoice.dueOn)}.`,
    'The banking details are on the invoice. Please use the invoice number as the reference.',
    'Thank you!',
    from,
  ].join('\n\n')
}

export function whatsAppLink(phone: string, text: string): string {
  const digits = toInternationalNumber(phone).replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export function mailtoLink(email: string, subject: string, text: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
}

/** What the owner needs filled in before invoices look professional. */
export function missingDetails(settings: BusinessSettings): string[] {
  const missing: string[] = []
  if (settings.bankDetails.trim() === '') missing.push('your bank details')
  if (settings.vatRegistered && settings.vatNumber.trim() === '') missing.push('your VAT number')
  return missing
}
