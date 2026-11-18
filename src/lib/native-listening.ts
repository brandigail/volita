import { Capacitor, registerPlugin } from '@capacitor/core'

interface VolitaListeningPlugin {
  start: () => Promise<{ running: boolean }>
  stop: () => Promise<{ running: boolean }>
  openApp: (options: { url: string; packages: readonly string[] }) => Promise<{ opened: 'app' | 'store' }>
}

/** Implemented in android/ (ListeningService). It only exists inside the Android app, never in a browser. */
const Native = registerPlugin<VolitaListeningPlugin>('VolitaListening')

export const isAndroidApp = Capacitor.getPlatform() === 'android'

/** Asks Android to keep the microphone alive with the screen off. Returns false in a browser or if Android refuses. */
export async function startBackgroundListening(): Promise<boolean> {
  if (!isAndroidApp) return false
  try {
    return (await Native.start()).running
  } catch {
    return false
  }
}

/** Opens another app at a link if it is installed; otherwise opens its Play Store page. Android app only. */
export async function openInstalledApp(url: string, packages: readonly string[]): Promise<boolean> {
  if (!isAndroidApp) return false
  try {
    await Native.openApp({ url, packages })
    return true
  } catch {
    return false
  }
}

export async function stopBackgroundListening(): Promise<void> {
  if (!isAndroidApp) return
  try {
    await Native.stop()
  } catch {
    // nothing to stop
  }
}
