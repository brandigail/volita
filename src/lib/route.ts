/** The pages anyone can open without signing in. Everything else is the app itself (or the landing page when signed out). */
export type PublicPage = 'privacy' | 'terms' | 'support' | 'check'

const PAGES: Record<string, PublicPage> = { '/privacy': 'privacy', '/terms': 'terms', '/support': 'support', '/check': 'check' }

/** The public page an address points to, or null for the home address and anything else. A trailing slash is ignored. */
export function publicPageFor(pathname: string): PublicPage | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return PAGES[clean.toLowerCase()] ?? null
}

/** The owner's booking link, /book/their-address: the address part, or null for any other address. */
export function bookingSlugFor(pathname: string): string | null {
  const match = /^\/book\/([a-z0-9][a-z0-9-]{2,39})\/?$/i.exec(pathname)
  return match ? match[1].toLowerCase() : null
}
