const KEY = 'volita-member'

/**
 * Whether this device has had someone signed in before. A new visitor sees the landing page at once, instead of a
 * "Loading" screen while the app checks for a session; a returning member gets the app's own loading screen.
 */
export function isKnownMember(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function rememberMember(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // ignore: the next visit simply shows the landing page for a moment
  }
}
