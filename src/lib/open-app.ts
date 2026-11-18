import type { Channel } from './channels'
import { isAndroidApp, openInstalledApp } from './native-listening'

/** Chrome on Android opens the app if it is installed and the Play Store page for the package if it is not. */
function buildIntentUrl(link: string, androidPackage: string): string {
  const [scheme, rest] = link.split('://')
  return `intent://${rest}#Intent;scheme=${scheme};package=${androidPackage};end`
}

/**
 * Takes someone to a social app from a button: the app if it is on their Android phone, the Play Store if not.
 * Returns false when it did nothing (desktop, iPhone, or a channel whose web link already opens the app), so the plain link runs instead.
 */
export function openSocialApp(channel: Channel): boolean {
  const { appUrl, androidApp } = channel
  if (!appUrl || !androidApp) return false

  if (isAndroidApp) {
    void openInstalledApp(androidApp.link, androidApp.packages).then((opened) => {
      if (!opened) window.open(appUrl, '_blank', 'noopener,noreferrer')
    })
    return true
  }
  if (/Android/i.test(navigator.userAgent)) {
    window.location.href = buildIntentUrl(androidApp.link, androidApp.packages[0])
    return true
  }
  return false
}
