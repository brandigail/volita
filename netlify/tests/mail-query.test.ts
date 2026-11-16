import { describe, expect, it } from 'vitest'
import { parseMailQuery } from '../functions/_lib/mail-query.ts'

const now = Date.UTC(2026, 10, 16, 12)

describe('parseMailQuery', () => {
  it('reads the search words the assistant uses', () => {
    const query = parseMailQuery('from:jan subject:"deck quote" newer_than:7d is:unread', now)
    expect(query.from).toEqual(['jan'])
    expect(query.subject).toEqual(['deck quote'])
    expect(query.since?.toISOString()).toBe('2026-11-09T12:00:00.000Z')
    expect(query.unread).toBe(true)
    expect(query.folder).toBe('inbox')
  })
  it('keeps plain words and phrases, and understands dates and the sent folder', () => {
    const query = parseMailQuery('in:inbox "timber supplier" invoice after:2026/11/01 in:sent has:attachment', now)
    expect(query.words).toEqual(['timber supplier', 'invoice'])
    expect(query.since?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(query.folder).toBe('sent')
  })
})
