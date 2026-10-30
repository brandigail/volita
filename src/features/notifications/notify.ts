import { Capacitor } from '@capacitor/core'
import { NAVIGATE_EVENT } from './prefs'
import type { Tab } from '../../components/TabBar'

/** One notification Apex wants shown at a time. */
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
const CHANNEL_ID = 'apex-reminders'
/** Timers longer than this overflow, so the browser only schedules what is due within a day. */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000

/** A stable positive 31-bit number from a key, which is what Android wants for a notification id. */
function idFor(key: string): number {
  let hash = 7
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.abs(hash) % 2_000_000_000
}

async function localNotifications() {
  return (await import('@capacitor/local-notifications')).LocalNotifications
}

export async function permissionState(): Promise<PermissionState> {
  if (isNativeApp) {
    const { display } = await (await localNotifications()).checkPermissions()
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
  }
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission === 'default' ? 'prompt' : Notification.permission
}

/** Asks for permission. Call from a tap, at a moment the person understands why. */
export async function requestPermission(): Promise<PermissionState> {
  if (isNativeApp) {
    const plugin = await localNotifications()
    const { display } = await plugin.requestPermissions()
    if (display === 'granted') {
      // Android's pop-up channel: high importance so reminders actually appear on screen instead of sitting silently in the shade.
      await plugin.createChannel({ id: CHANNEL_ID, name: 'Reminders', description: 'Send reminders, meetings and your briefing', importance: 5, visibility: 1, vibration: true }).catch(() => undefined)
      // Android 12 and up needs this switch for reminders to arrive on time.
      const exact = await plugin.checkExactNotificationSetting().catch(() => null)
      if (exact && exact.exact_alarm !== 'granted') await plugin.changeExactNotificationSetting().catch(() => undefined)
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
    await (await localNotifications()).schedule({
      notifications: [{ id: idFor(`test-${Date.now()}`), title, body, channelId: CHANNEL_ID, schedule: { at: new Date(Date.now() + 1_000), allowWhileIdle: true } }],
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
 * Replaces everything scheduled with this list. On the phone app the system delivers them even when Apex is closed.
 * In a browser they can only fire while the page is open (full web push needs a push service, which is not set up).
 */
export async function schedule(planned: PlannedNotification[]): Promise<void> {
  if (isNativeApp) {
    const plugin = await localNotifications()
    const pending = await plugin.getPending()
    if (pending.notifications.length > 0) await plugin.cancel({ notifications: pending.notifications })
    if (planned.length === 0) return
    await plugin.schedule({
      notifications: planned.map((item) => ({
        id: idFor(item.key),
        title: item.title,
        body: item.body,
        channelId: CHANNEL_ID,
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
  const handle = await (await localNotifications()).addListener('localNotificationActionPerformed', (event) => {
    const tab = (event.notification.extra as { tab?: Tab } | undefined)?.tab
    if (tab) window.dispatchEvent(new CustomEvent<Tab>(NAVIGATE_EVENT, { detail: tab }))
  })
  return () => void handle.remove()
}
