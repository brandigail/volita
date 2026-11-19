import { describe, expect, it } from 'vitest'
import { buildIcs } from './ics'

describe('buildIcs', () => {
  const event = { title: 'Dube Plumbing, geyser', startsAt: '2026-11-20T07:00:00.000Z', endsAt: '2026-11-20T08:00:00.000Z', uid: 'abc-123', description: 'Bring the old valve;\nsecond line' }

  it('writes the times in UTC without separators, and a stable id', () => {
    const ics = buildIcs(event, new Date('2026-11-19T10:00:00Z'))
    expect(ics).toContain('DTSTART:20261120T070000Z')
    expect(ics).toContain('DTEND:20261120T080000Z')
    expect(ics).toContain('DTSTAMP:20261119T100000Z')
    expect(ics).toContain('UID:abc-123@volita')
  })

  it('escapes the characters that mean something in a calendar file', () => {
    const ics = buildIcs(event)
    expect(ics).toContain('SUMMARY:Dube Plumbing\\, geyser')
    expect(ics).toContain('DESCRIPTION:Bring the old valve\\;\\nsecond line')
  })

  it('is a complete calendar with CRLF line endings', () => {
    const ics = buildIcs(event)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
  })
})
