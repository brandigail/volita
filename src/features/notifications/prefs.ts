export interface NotificationPrefs {
  /** "Time to send" reminders for drafts with a send-at time. */
  sendAt: boolean
  /** A heads-up shortly before a meeting. */
  meetings: boolean
  /** The morning briefing at a set hour (Pro). */
  briefing: boolean
  /** Time of day, "HH:MM" to the minute, for the briefing and the follow-up nudge. */
  time: string
  /** A daily nudge about quotes nobody has answered (Basic and up). */
  followUps: boolean
  /** How many minutes before a meeting or a send time to be told. 0 means exactly at that time. */
  leadMinutes: number
}

export const DEFAULT_PREFS: NotificationPrefs = { sendAt: true, meetings: true, briefing: true, time: '08:00', followUps: true, leadMinutes: 10 }

/** The lead times offered in settings. */
export const LEAD_OPTIONS: readonly { minutes: number; label: string }[] = [
  { minutes: 0, label: 'At the time' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 1440, label: '1 day before' },
]

/** "10 minutes", "1 hour", "1 day": how a lead time reads inside a notification. */
export function leadPhrase(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`
  return `${minutes} minutes`
}

const KEY = 'volita-notification-prefs'
/** Fired when preferences change or the schedule needs rebuilding (a send time was set, a draft was sent). */
export const RESCHEDULE_EVENT = 'volita:reschedule'
/** Fired when tapping a notification should open a tab. */
export const NAVIGATE_EVENT = 'volita:navigate'

export function readPrefs(): NotificationPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NotificationPrefs> | null
    return { ...DEFAULT_PREFS, ...stored }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable; the choice lasts until the page is closed
  }
  window.dispatchEvent(new Event(RESCHEDULE_EVENT))
}

/** Tells the scheduler to rebuild, for example after a send time changed. */
export function requestReschedule(): void {
  window.dispatchEvent(new Event(RESCHEDULE_EVENT))
}
