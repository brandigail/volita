import { z } from 'zod'

/** Pure helpers for email text and headers: no network, no database, so they are easy to test. */

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailPayload {
  mimeType?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number }
  parts?: GmailPayload[]
}

export interface Address {
  name: string
  email: string
}

/** The most text of one email that is ever handed to the assistant. */
export const MAX_BODY_CHARS = 3_500

const emailSchema = z.email().max(254)

export function isEmailAddress(value: string): boolean {
  return emailSchema.safeParse(value).success
}

/**
 * Header values must be one line. A line break inside "to" or "subject" would let text add its own headers (for example a
 * hidden Bcc), so any control character is refused rather than cleaned up.
 */
export function hasControlCharacters(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 32 || code === 127 || code === 0x2028 || code === 0x2029) return true
  }
  return false
}

/** "Sam Dube <sam@example.com>" or a bare address. Returns null when no valid address is found. */
export function parseAddress(raw: string): Address | null {
  const text = raw.trim()
  const angle = /^(.*?)<([^<>]+)>\s*$/.exec(text)
  const email = (angle?.[2] ?? text).trim().toLowerCase()
  if (!isEmailAddress(email)) return null
  const name = (angle?.[1] ?? '').trim().replace(/^"|"$/g, '').trim()
  return { name, email }
}

export function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const wanted = name.toLowerCase()
  return headers?.find((h) => h.name.toLowerCase() === wanted)?.value ?? ''
}

/** "Re: " in front of a subject, once. */
export function replySubject(subject: string): string {
  const clean = subject.trim() || '(no subject)'
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`
}

/** Non-ASCII subjects must be encoded (RFC 2047) or mail programs show garbage. */
export function encodeSubject(subject: string): string {
  const printable = [...subject].every((ch) => {
    const code = ch.codePointAt(0) ?? 0
    return code >= 32 && code <= 126
  })
  return printable ? subject : `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
}

function wrap76(base64: string): string {
  return base64.match(/.{1,76}/g)?.join('\r\n') ?? ''
}

export interface OutgoingEmail {
  from: string
  to: string
  subject: string
  body: string
  /** The Message-ID header of the email being answered, so it lands in the same conversation. */
  inReplyTo?: string
  references?: string
}

/** The raw RFC 2822 message, base64url encoded the way the Gmail API wants it. Throws if any header holds a control character. */
export function buildRawMessage(email: OutgoingEmail): string {
  const headerParts = [email.from, email.to, email.subject, email.inReplyTo ?? '', email.references ?? '']
  if (headerParts.some(hasControlCharacters)) throw new Error('A header contained a control character.')
  if (!isEmailAddress(email.to) || !isEmailAddress(email.from)) throw new Error('Not a valid email address.')
  const lines = [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Subject: ${encodeSubject(email.subject)}`,
    ...(email.inReplyTo ? [`In-Reply-To: ${email.inReplyTo}`] : []),
    ...(email.references ? [`References: ${email.references}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(email.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64')),
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

/** Reads a base64url string from the API as text. */
export function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8')
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
      if (code.startsWith('#')) {
        const point = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isInteger(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : ' '
      }
      return NAMED_ENTITIES[code.toLowerCase()] ?? match
    })
}

function findPart(payload: GmailPayload, mimeType: string): string | null {
  if (payload.mimeType === mimeType && payload.body?.data) return decodeBase64Url(payload.body.data)
  for (const part of payload.parts ?? []) {
    const found = findPart(part, mimeType)
    if (found !== null) return found
  }
  return null
}

/** Removes what a person does not need read to them: quoted earlier messages, "On ... wrote:" lines, excess blank lines. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue
    if (/^\s*on .{5,120}wrote:\s*$/i.test(line) || /^\s*-{2,}\s*original message\s*-{2,}/i.test(line) || /^\s*from:\s.+\bsent:\s/i.test(line)) break
    kept.push(line)
  }
  return kept.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** The readable text of an email: plain text if there is some, otherwise the HTML turned into text. Trimmed and capped. */
export function extractBody(payload: GmailPayload, max = MAX_BODY_CHARS): string {
  const plain = findPart(payload, 'text/plain')
  const text = plain ?? (findPart(payload, 'text/html') !== null ? htmlToText(findPart(payload, 'text/html') ?? '') : '')
  const cleaned = stripQuoted(text)
  return cleaned.length > max ? `${cleaned.slice(0, max).trimEnd()} [the rest was cut off]` : cleaned
}

const CLOSING = /^(?:kind |best |warm |many )?(?:regards|wishes|thanks|thank you|cheers|sincerely|yours(?: sincerely| faithfully)?)[,.!]*$/i

/**
 * The assistant is told not to add a sign-off, because the person's own is added for them, but models sometimes write
 * one anyway ("Best regards, Dad"). Closing lines and the person's own name, business or phone at the very end are
 * removed so the email does not end up signed twice.
 */
export function stripSignOff(body: string, own: string[]): string {
  const mine = own.map((line) => line.trim().toLowerCase()).filter(Boolean)
  const lines = body.trimEnd().split('\n')
  while (lines.length > 1) {
    const last = (lines[lines.length - 1] ?? '').trim()
    if (last === '' || CLOSING.test(last) || mine.includes(last.toLowerCase().replace(/[,.]+$/, ''))) lines.pop()
    else break
  }
  return lines.join('\n').trimEnd()
}
