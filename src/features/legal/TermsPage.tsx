import { SITE } from '../../config/site'
import { LegalLayout } from './LegalLayout'
import { TERMS_SECTIONS } from './termsSections'

/** The terms of use, in plain language. The same parts are shown one by one in the walkthrough every person must finish. */
export function TermsPage() {
  return (
    <LegalLayout title="Terms of use" intro={`The rules for using ${SITE.name}. Last updated ${SITE.legalUpdated}.`}>
      {TERMS_SECTIONS.map((section) => (
        <section key={section.id}>
          <h2>{section.title}</h2>
          {section.body}
        </section>
      ))}
    </LegalLayout>
  )
}
