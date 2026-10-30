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
}

export const DEFAULT_PREFS: NotificationPrefs = { sendAt: true, meetings: true, briefing: true, time: '08:00', followUps: true }

const KEY = 'apex-voice-notification-prefs'
/** Fired when preferences change or the schedule needs rebuilding (a send time was set, a draft was sent). */
export const RESCHEDULE_EVENT = 'apex:reschedule'
/** Fired when tapping a notification should open a tab. */
export const NAVIGATE_EVENT = 'apex:navigate'

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
