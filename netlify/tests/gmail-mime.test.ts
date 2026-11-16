import { describe, expect, it } from 'vitest'
import { buildRawMessage, decodeBase64Url, encodeSubject, extractBody, hasControlCharacters, headerValue, htmlToText, parseAddress, replySubject, stripQuoted, stripSignOff, type GmailPayload } from '../functions/_lib/gmail-mime.ts'

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url')

function decodeRaw(raw: string): { headers: Record<string, string>; body: string } {
  const text = decodeBase64Url(raw)
  const [head = '', ...rest] = text.split('\r\n\r\n')
  const headers: Record<string, string> = {}
  for (const line of head.split('\r\n')) {
    const at = line.indexOf(':')
    headers[line.slice(0, at)] = line.slice(at + 1).trim()
  }
  return { headers, body: Buffer.from(rest.join('\r\n\r\n').replace(/\r\n/g, ''), 'base64').toString('utf8') }
}

describe('parseAddress', () => {
  it('reads a name and an address, or a bare address', () => {
    expect(parseAddress('Sam Dube <Sam@Example.com>')).toEqual({ name: 'Sam Dube', email: 'sam@example.com' })
    expect(parseAddress('"Dube, Sam" <sam@example.com>')).toEqual({ name: 'Dube, Sam', email: 'sam@example.com' })
    expect(parseAddress('sam@example.com')).toEqual({ name: '', email: 'sam@example.com' })
  })

  it('refuses anything that is not one clean address', () => {
    for (const bad of ['', 'not an address', 'a@b', 'sam@example.com, other@example.com', 'Sam <sam@example.com\r\nBcc: x@y.com>']) {
      expect(parseAddress(bad)).toBeNull()
    }
  })
})

describe('headers', () => {
  it('finds a header whatever its case and spots control characters', () => {
    expect(headerValue([{ name: 'SUBJECT', value: 'Hi' }], 'subject')).toBe('Hi')
    expect(headerValue(undefined, 'subject')).toBe('')
    expect(hasControlCharacters('plain text')).toBe(false)
    for (const bad of ['a\nb', 'a\rb', 'a\u0000b', 'a b', 'a\u007fb']) expect(hasControlCharacters(bad)).toBe(true)
  })

  it('puts Re: in front once', () => {
    expect(replySubject('Quote for the deck')).toBe('Re: Quote for the deck')
    expect(replySubject('RE: Quote')).toBe('RE: Quote')
    expect(replySubject('  ')).toBe('Re: (no subject)')
  })

  it('encodes a subject that is not plain ASCII', () => {
    expect(encodeSubject('Plain subject')).toBe('Plain subject')
    const encoded = encodeSubject('Kwotasie vir Jan – R1 500')
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/)
    expect(Buffer.from(encoded.slice(10, -2), 'base64').toString('utf8')).toBe('Kwotasie vir Jan – R1 500')
  })
})

describe('buildRawMessage', () => {
  const base = { from: 'dad@example.com', to: 'client@example.com', subject: 'Re: Deck quote', body: 'Hi Jan,\nThe deck is R12 500.\n\nRegards\nDad' }

  it('builds a message that reads back exactly, including accents', () => {
    const { headers, body } = decodeRaw(buildRawMessage({ ...base, body: 'Dankie vir die kwotasie – R12 500, café.' }))
    expect(headers.From).toBe('dad@example.com')
    expect(headers.To).toBe('client@example.com')
    expect(headers.Subject).toBe('Re: Deck quote')
    expect(headers['Content-Type']).toBe('text/plain; charset="UTF-8"')
    expect(body).toBe('Dankie vir die kwotasie – R12 500, café.')
  })

  it('adds reply headers only when asked', () => {
    expect(decodeRaw(buildRawMessage(base)).headers['In-Reply-To']).toBeUndefined()
    const reply = decodeRaw(buildRawMessage({ ...base, inReplyTo: '<abc@mail.example.com>', references: '<abc@mail.example.com>' }))
    expect(reply.headers['In-Reply-To']).toBe('<abc@mail.example.com>')
    expect(reply.headers.References).toBe('<abc@mail.example.com>')
  })

  it('cannot be tricked into adding a hidden recipient through the subject or address', () => {
    expect(() => buildRawMessage({ ...base, subject: 'Hello\r\nBcc: spy@example.com' })).toThrow()
    expect(() => buildRawMessage({ ...base, to: 'client@example.com\r\nBcc: spy@example.com' })).toThrow()
    expect(() => buildRawMessage({ ...base, inReplyTo: '<x>\nBcc: spy@example.com' })).toThrow()
  })

  it('refuses an invalid address', () => {
    expect(() => buildRawMessage({ ...base, to: 'nobody' })).toThrow()
  })

  it('wraps long bodies in short lines', () => {
    const raw = decodeBase64Url(buildRawMessage({ ...base, body: 'word '.repeat(2000) }))
    expect(raw.split('\r\n').every((line) => line.length <= 998)).toBe(true)
  })
})

describe('reading an email', () => {
  it('turns HTML into text and decodes entities', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Hello&nbsp;&amp; welcome</p><p>R&#49;&#x35;00<br>next</p>').replace(/\s+/g, ' ').trim()).toBe('Hello & welcome R1500 next')
  })

  it('drops quoted earlier messages and everything after "wrote:"', () => {
    const text = 'Yes please go ahead.\n\n> old text\n> more old\n\nOn Mon, 3 Nov 2026 at 09:00, Jan <jan@example.com> wrote:\nthe whole thread again'
    expect(stripQuoted(text)).toBe('Yes please go ahead.')
  })

  it('prefers plain text, falls back to HTML and searches nested parts', () => {
    const multipart: GmailPayload = { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: b64('<p>HTML version</p>') } }, { mimeType: 'text/plain', body: { data: b64('Plain version') } }] }
    expect(extractBody(multipart)).toBe('Plain version')
    const htmlOnly: GmailPayload = { mimeType: 'multipart/mixed', parts: [{ mimeType: 'multipart/related', parts: [{ mimeType: 'text/html', body: { data: b64('<div>Only <b>HTML</b></div>') } }] }] }
    expect(extractBody(htmlOnly)).toBe('Only  HTML')
    expect(extractBody({ mimeType: 'image/png' })).toBe('')
  })

  it('cuts very long emails and says so', () => {
    const long: GmailPayload = { mimeType: 'text/plain', body: { data: b64('x'.repeat(10_000)) } }
    const body = extractBody(long, 100)
    expect(body.length).toBeLessThan(140)
    expect(body.endsWith('[the rest was cut off]')).toBe(true)
  })
})

describe('stripSignOff', () => {
  const own = ['Dad Myers', 'Myers Decks', 'Owner', '']

  it('removes a closing and the person\'s own name written by the model', () => {
    expect(stripSignOff('Hi Jan,\n\nIt is R12 500.\n\nBest regards,\nDad Myers', own)).toBe('Hi Jan,\n\nIt is R12 500.')
    expect(stripSignOff('Hi Jan,\n\nIt is R12 500.\n\nKind regards\nDad Myers\nMyers Decks\n', own)).toBe('Hi Jan,\n\nIt is R12 500.')
    expect(stripSignOff('Hi Jan, thanks!\nCheers,', own)).toBe('Hi Jan, thanks!')
  })

  it('leaves the message alone when it has no sign-off, and never empties it', () => {
    expect(stripSignOff('Hi Jan,\n\nThe deck is R12 500 and thanks for asking.', own)).toBe('Hi Jan,\n\nThe deck is R12 500 and thanks for asking.')
    expect(stripSignOff('Thanks', own)).toBe('Thanks')
  })

  it('does not remove someone else\'s name', () => {
    expect(stripSignOff('Please call Sam\nSam Dube', own)).toBe('Please call Sam\nSam Dube')
  })
})
