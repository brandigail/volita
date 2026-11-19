import type { PublicPage as PublicPageName } from '../../lib/route'
import { CheckPage } from '../check/CheckPage'
import { PrivacyPage } from './PrivacyPage'
import { SupportPage } from './SupportPage'
import { TermsPage } from './TermsPage'

/** Shows one of the pages anyone can open, signed in or not. */
export function PublicPage({ page }: { page: PublicPageName }) {
  if (page === 'privacy') return <PrivacyPage />
  if (page === 'terms') return <TermsPage />
  if (page === 'check') return <CheckPage />
  return <SupportPage />
}
