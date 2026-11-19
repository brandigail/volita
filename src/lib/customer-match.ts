// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export interface CustomerIdentity {
  name: string
  phone: string
  email: string
}

/** Lower case, no accents, single spaces: "  José  Naidoo " and "jose naidoo" are the same name. */
export const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** The last nine digits of a phone number, so 082 123 4567, +27 82 123 4567 and 27821234567 all look the same. Empty when too short to trust. */
export function phoneTail(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 9 ? digits.slice(-9) : ''
}

const escapeForRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether some text (a draft's recipient, a meeting title, an invoice customer) is about this customer: their full name as whole
 * words, their email, or their phone number. A first name alone never counts, because "Sam" would match "Samsung".
 */
export function mentionsCustomer(text: string, who: CustomerIdentity): boolean {
  const haystack = plain(text)
  if (haystack === '') return false
  const name = plain(who.name)
  if (name.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeForRegex(name)}($|[^\\p{L}\\p{N}])`, 'u').test(haystack)) return true
  const email = who.email.trim().toLowerCase()
  if (email !== '' && haystack.includes(email)) return true
  const tail = phoneTail(who.phone)
  return tail !== '' && text.replace(/\D/g, '').includes(tail)
}
