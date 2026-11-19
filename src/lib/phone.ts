// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** The country code used for numbers written the local way ("082 123 4567"). Volita is run from South Africa. */
const DEFAULT_COUNTRY_CODE = '27'

/**
 * A phone number in the international form WhatsApp needs ("+27821234567"). Local numbers starting with 0 are given the
 * South African code; a number already written with "+" or "00" is kept; anything else is returned as it was typed.
 */
export function toInternationalNumber(raw: string): string {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 7) return trimmed
  if (trimmed.startsWith('+')) return `+${digits}`
  if (trimmed.startsWith('00')) return `+${digits.slice(2)}`
  if (digits.startsWith('0')) return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length >= 11) return `+${digits}`
  return trimmed
}
