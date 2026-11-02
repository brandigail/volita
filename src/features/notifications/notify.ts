import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { NAVIGATE_EVENT } from './prefs'
import type { Tab } from '../../components/TabBar'

/** One notification Volita wants shown at a time. */
export interface PlannedNotification {
  /** Stable key: the same thing always gets the same id, so rebuilding the schedule never doubles it. */
  key: string
  title: string
  body: string
  at: Date
  /** Which tab to open when it is tapped. */
  tab: Tab
  /** Repeat every day at this time (the briefing). */
  daily?: boolean
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export const isNativeApp = Capacitor.isNativePlatform()
const CHANNEL_ID = 'volita-reminders'
/** Timers longer than this overflow, so the browser only schedules what is due within a day. */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000

/** A stable positive 31-bit number from a key, which is what Android wants for a notification id. */
function idFor(key: string): number {
  let hash = 7
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.abs(hash) % 2_000_000_000
}


/**
 * Android silently drops a notification whose channel does not exist, so every path that shows one makes sure the
 * channel is there first (creating an existing channel is a no-op). Importance 5 makes reminders pop up on screen.
 */
async function ensureChannel(plugin: typeof LocalNotifications): Promise<void> {
  await plugin.createChannel({ id: CHANNEL_ID, name: 'Reminders', description: 'Send reminders, meetings and your briefing', importance: 5, visibility: 1, vibration: true })
}

/**
 * Whether Android lets Volita fire reminders at the exact minute. When it does not, scheduling an exact reminder makes
 * Android open its "Alarms & reminders" screen and wait there, so every schedule call asks this first and only
 * requests exact times when they are allowed.
 */
export async function exactAlarmsAllowed(): Promise<boolean> {
  if (!isNativeApp) return true
  const exact = await LocalNotifications.checkExactNotificationSetting().catch(() => null)
  return exact === null || exact.exact_alarm === 'granted'
}

/** Opens Android's "Alarms & reminders" screen for Volita. Call from a tap. */
export async function askForExactAlarms(): Promise<void> {
  if (isNativeApp) await LocalNotifications.changeExactNotificationSetting().catch(() => undefined)
}

export async function permissionState(): Promise<PermissionState> {
  if (isNativeApp) {
    const { display } = await LocalNotifications.checkPermissions()
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
  }
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission === 'default' ? 'prompt' : Notification.permission
}

/** Asks for permission. Call from a tap, at a moment the person understands why. */
export async function requestPermission(): Promise<PermissionState> {
  if (isNativeApp) {
    const plugin = LocalNotifications
    const { display } = await plugin.requestPermissions()
    if (display === 'granted') {
      await ensureChannel(plugin).catch(() => undefined)
      // Android 12 and up needs this switch for reminders to arrive on time.
      if (!(await exactAlarmsAllowed())) await askForExactAlarms()
    }
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
  }
  if (!('Notification' in window)) return 'unsupported'
  const result = await Notification.requestPermission()
  return result === 'default' ? 'prompt' : result
}

/** Shows one right now. Used by the "send test notification" button. */
export async function showNow(title: string, body: string): Promise<void> {
  if (isNativeApp) {
    const plugin = LocalNotifications
    await ensureChannel(plugin)
    await plugin.schedule({
      notifications: [
        { id: idFor(`test-${Date.now()}`), title, body, channelId: CHANNEL_ID, isExactNotification: await exactAlarmsAllowed(), schedule: { at: new Date(Date.now() + 1_000), allowWhileIdle: true } },
      ],
    })
    return
  }
  await showWeb(title, body)
}

async function showWeb(title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  if (registration) await registration.showNotification(title, { body, icon: '/icon-192.png', tag: title })
  else new Notification(title, { body, icon: '/icon-192.png' })
}

let webTimers: number[] = []

/**
 * Replaces everything scheduled with this list. On the phone app the system delivers them even when Volita is closed.
 * In a browser they can only fire while the page is open (full web push needs a push service, which is not set up).
 */
export async function schedule(planned: PlannedNotification[]): Promise<void> {
  if (isNativeApp) {
    const plugin = LocalNotifications
    await ensureChannel(plugin)
    const pending = await plugin.getPending()
    if (pending.notifications.length > 0) await plugin.cancel({ notifications: pending.notifications })
    if (planned.length === 0) return
    const exact = await exactAlarmsAllowed()
    await plugin.schedule({
      notifications: planned.map((item) => ({
        id: idFor(item.key),
        title: item.title,
        body: item.body,
        channelId: CHANNEL_ID,
        isExactNotification: exact,
        extra: { tab: item.tab },
        schedule: item.daily
          ? { on: { hour: item.at.getHours(), minute: item.at.getMinutes() }, allowWhileIdle: true }
          : { at: item.at, allowWhileIdle: true },
      })),
    })
    return
  }

  for (const timer of webTimers) window.clearTimeout(timer)
  webTimers = []
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const now = Date.now()
  for (const item of planned) {
    const wait = item.at.getTime() - now
    if (wait <= 0 || wait > MAX_TIMER_MS) continue
    webTimers.push(window.setTimeout(() => void showWeb(item.title, item.body), wait))
  }
}

/** Opens the right tab when a notification is tapped on the phone app. */
export async function listenForTaps(): Promise<() => void> {
  if (!isNativeApp) return () => undefined
  const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const tab = (event.notification.extra as { tab?: Tab } | undefined)?.tab
    if (tab) window.dispatchEvent(new CustomEvent<Tab>(NAVIGATE_EVENT, { detail: tab }))
  })
  return () => void handle.remove()
}
