// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export interface IcsEvent {
  title: string
  /** ISO times. */
  startsAt: string
  endsAt: string
  description?: string
  /** A stable id, so adding the same booking twice does not create two events. */
  uid: string
}

/** 20261120T080000Z */
const stamp = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Commas, semicolons, backslashes and line breaks mean something in this format and must be escaped. */
const escapeText = (text: string): string => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** A calendar file (.ics) that any phone can add to its calendar. */
export function buildIcs(event: IcsEvent, now: Date = new Date()): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Volita//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}@volita`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
