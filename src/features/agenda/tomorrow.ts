import type { AgendaItem } from '../../types/agenda'

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

/** The text of tomorrow's plan: meetings and the messages planned to go out. */
export function tomorrowText(items: readonly AgendaItem[], now = new Date()): { text: string; count: number } {
  const start = new Date(now)
  start.setDate(start.getDate() + 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const tomorrow = items.filter((item) => new Date(item.startsAt) >= start && new Date(item.startsAt) < end)
  const line = (item: AgendaItem) => `• ${item.allDay ? 'All day' : clock.format(new Date(item.startsAt))} ${item.title}`
  const meetings = tomorrow.filter((item) => item.source !== 'draft').map(line)
  const sends = tomorrow.filter((item) => item.source === 'draft').map(line)
  const parts = [`Tomorrow, ${dayName.format(start)}`]
  if (meetings.length > 0) parts.push('', 'On my agenda:', ...meetings)
  if (sends.length > 0) parts.push('', 'To send:', ...sends)
  return { text: parts.join('\n'), count: tomorrow.length }
}
