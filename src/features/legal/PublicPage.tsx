import type { PublicPage as PublicPageName } from '../../lib/route'
import { PrivacyPage } from './PrivacyPage'
import { SupportPage } from './SupportPage'
import { TermsPage } from './TermsPage'

/** Shows one of the pages anyone can open, signed in or not. */
export function PublicPage({ page }: { page: PublicPageName }) {
  if (page === 'privacy') return <PrivacyPage />
  if (page === 'terms') return <TermsPage />
  return <SupportPage />
}
