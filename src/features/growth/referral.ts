const STORAGE_KEY = 'volita-referral-code'
/** A code is 8 characters from a short alphabet; anything else in the address is ignored. */
const SHAPE = /^[A-Za-z0-9]{4,16}$/

/** The referral code in an address such as /?ref=ABCD2345, or null if there is none or it looks wrong. */
export function referralFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('ref')
  return value && SHAPE.test(value) ? value.toUpperCase() : null
}

/** Remembers the code from the address so it survives the sign-up form. Never throws: storage can be blocked. */
export function rememberReferral(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // ignore: the link will simply not be remembered
  }
}

export function recalledReferral(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored && SHAPE.test(stored) ? stored : null
  } catch {
    return null
  }
}

export function forgetReferral(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** The link a person shares: the site's own address with their code. */
export function referralLink(origin: string, code: string): string {
  return `${origin}/?ref=${encodeURIComponent(code)}`
}
