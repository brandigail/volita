import { AudioWaveform } from 'lucide-react'
import type { ReactNode } from 'react'
import { SITE } from '../../config/site'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-(--line) py-8 text-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4">
        <p className="muted">© {new Date().getFullYear()} {SITE.name}. Made in South Africa.</p>
        <nav aria-label="Legal and help" className="flex flex-wrap gap-x-5 gap-y-2 font-semibold">
          <a href="/privacy" className="hover:underline">
            Privacy
          </a>
          <a href="/terms" className="hover:underline">
            Terms
          </a>
          <a href="/support" className="hover:underline">
            Support
          </a>
        </nav>
      </div>
    </footer>
  )
}

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
      <a href="/" className="flex items-center gap-2 text-lg font-extrabold" aria-label={`${SITE.name} home`}>
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-ember-700 to-ember-500 text-white shadow-lg shadow-ember-600/30">
          <AudioWaveform className="size-5" aria-hidden="true" />
        </span>
        <span className="text-gradient">{SITE.name}</span>
      </a>
      {children}
    </header>
  )
}

interface LegalLayoutProps {
  title: string
  /** One line under the title, such as when the page was last updated. */
  intro: string
  children: ReactNode
}

/** The frame the Privacy, Terms and Support pages share: a header, a readable column and the footer. */
export function LegalLayout({ title, intro, children }: LegalLayoutProps) {
  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <a href="/" className="btn btn-ghost">
          Open Volita
        </a>
      </SiteHeader>
      <main className="mx-auto max-w-3xl px-4 pt-6">
        <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
        <p className="muted mt-2">{intro}</p>
        <div className="mt-8 space-y-8 leading-relaxed [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}
