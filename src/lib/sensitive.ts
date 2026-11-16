// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/**
 * Spots information Volita must never send to the AI or save: card numbers, bank account details and passwords or
 * PINs. The server checks every piece of text before it goes anywhere; the app checks too, so it can warn at once.
 * It aims to catch real details without tripping on prices, phone numbers, dates or addresses in an ordinary quote.
 */

export type SensitiveKind = 'card' | 'bank' | 'password'

export const SENSITIVE_LABEL: Record<SensitiveKind, string> = {
  card: 'a card number',
  bank: 'bank account details',
  password: 'a password, PIN or security code',
}

/** The checksum every real card number passes; random digits fail it 9 times in 10. */
function passesLuhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

// Card numbers are written in groups of four or (American Express) 4-6-5; one unbroken run is LONG_DIGITS below.
// Speech-to-text may also write a spoken card number like one huge amount ("4,539,148,803,436,467"), so one unbroken
// token of digit groups joined by commas, dots or dashes is tried too. A list of separate prices ("5,000 2,500 5,100")
// has spaces between them, so it never joins up into one; the checksum and the length keep everything else out.
const CARD_PATTERNS = [
  /(?<!\d[.,]?)\d{4}([ -])\d{4}\1\d{4}\1\d{3,7}(?![.,]?\d)/g,
  /(?<!\d[.,]?)\d{4}[ -]\d{6}[ -]\d{5}(?![.,]?\d)/g,
  /(?<![\d,.-])\d{1,4}(?:[,.-]\d{1,4}){3,9}(?!\d)/g,
]

/**
 * Speech-to-text sometimes garbles a long number ("4111 1111 1111 1111" can come back as "4111,000"), so saying
 * "card number is" followed by digits counts as well, whatever the digits look like.
 */
const CARD_PHRASE = /\b(?:credit\s+|debit\s+|bank\s+)?(?:card|visa|mastercard|amex)\s*(?:number|no\.?|num|#|details)\s*(?:is|was|:|=|-|are)?\s*\d[\d ,.-]{3,}/i

/**
 * One unbroken run of 15 to 19 digits that starts like a card (Amex has 15, most cards 16). Speech-to-text often mishears a
 * digit, which breaks the checksum, so this one does not need it: prices, phone numbers and invoice numbers are not
 * written as 15 or more digits in a row.
 */
const LONG_DIGITS = /(?<!\d[.,]?)[2-6]\d{14,18}(?![.,]?\d)/

function hasCardNumber(text: string): boolean {
  if (CARD_PHRASE.test(text) || LONG_DIGITS.test(text)) return true
  return CARD_PATTERNS.some((pattern) =>
    [...text.matchAll(pattern)].some((match) => {
      const digits = match[0].replace(/\D/g, '')
      // Real cards start with 2 to 6 (Mastercard, Visa, Amex, Discover and so on).
      return digits.length >= 15 && digits.length <= 19 && /^[2-6]/.test(digits) && passesLuhn(digits)
    }),
  )
}

/** International bank account numbers carry their own check digits (mod 97), so a match is almost never an accident. */
function hasIban(text: string): boolean {
  return [...text.toUpperCase().matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g)].some((match) => {
    const iban = match[0].replace(/ /g, '')
    const moved = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55))
    let remainder = 0
    for (const digit of moved) remainder = (remainder * 10 + Number(digit)) % 97
    return remainder === 1
  })
}

const SEPARATOR = String.raw`\s*(?:is|was|=|:|-|number|no\.?|num|#)?\s*(?:is|:)?\s*`
const ACCOUNT_NUMBER = new RegExp(String.raw`\b(?:bank\s+)?(?:account|acc|acct|a\/c)\.?${SEPARATOR}(\d(?:[ -]?\d){5,16})(?!\d)`, 'i')
const BRANCH_CODE = /\b(?:branch|routing|sort|bsb|transit)\s+(?:code|number|no\.?)\s*(?:is|=|:|-)?\s*\d(?:[ -]?\d){4,9}\b/i
// The keyword in any case, but the code itself in capitals, so "the swift delivery" is not mistaken for one.
const SWIFT_CODE = /\b(?:[Ss][Ww][Ii][Ff][Tt]|[Bb][Ii][Cc])(?:\s+[Cc]ode)?\s*(?:is|=|:|-)?\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/

function hasBankDetails(text: string): boolean {
  return ACCOUNT_NUMBER.test(text) || BRANCH_CODE.test(text) || SWIFT_CODE.test(text) || hasIban(text)
}

const SECRET_WORDS = String.raw`passwords?|pass\s?words?|passcodes?|pins?(?:\s+(?:number|code))?|otp|one[- ]time\s+(?:pin|password|code)|security\s+code|verification\s+code|login\s+code|cvv|cvc|cvv2`
const SECRET = new RegExp(String.raw`\b(?:${SECRET_WORDS})\b\s*(?:is|was|will be|=|:|-|it's|it is)\s*["'“]?([^\s"'”,.;!?]{3,})`, 'gi')
/** Words that follow "password is" in ordinary talk about a password rather than the password itself. */
const NOT_A_SECRET = new Set(['wrong', 'incorrect', 'correct', 'right', 'reset', 'expired', 'forgotten', 'changed', 'not', 'too', 'still', 'working', 'required', 'needed', 'same', 'different', 'weak', 'strong', 'short', 'long', 'invalid', 'valid', 'missing', 'blocked', 'locked', 'the', 'my', 'your', 'his', 'her', 'their', 'our', 'in', 'on', 'at', 'for', 'and', 'that', 'this', 'what', 'where', 'there', 'here', 'safe', 'secret', 'private', 'case', 'sensitive', 'easy', 'hard', 'new', 'old', 'set', 'sent', 'coming', 'below', 'above', 'attached'])

function hasSecret(text: string): boolean {
  return [...text.matchAll(SECRET)].some((match) => {
    const value = match[1] ?? ''
    if (NOT_A_SECRET.has(value.toLowerCase())) return false
    const word = match[0].toLowerCase()
    // A PIN, code or CVV is made of digits; a password can be anything.
    return /pass/.test(word) ? true : /\d{3,}/.test(value)
  })
}

/** Which kinds of protected information the text contains; empty when it is fine to send. */
export function findSensitive(text: string): SensitiveKind[] {
  const found: SensitiveKind[] = []
  if (hasCardNumber(text)) found.push('card')
  if (hasBankDetails(text)) found.push('bank')
  if (hasSecret(text)) found.push('password')
  return found
}

/** "a card number and a password, PIN or security code" */
export function describeSensitive(kinds: readonly SensitiveKind[]): string {
  const labels = kinds.map((kind) => SENSITIVE_LABEL[kind])
  return labels.length <= 1 ? (labels[0] ?? 'private details') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/** What the person is told, on screen and by the assistant. */
export function sensitiveMessage(kinds: readonly SensitiveKind[]): string {
  return `Volita cannot send this. It looks like it has ${describeSensitive(kinds)}. To protect you and other people, Volita never sends card numbers, bank account details or passwords to the AI and never saves them. Please say it again without them.`
}
