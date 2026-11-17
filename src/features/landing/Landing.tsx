import { Gift, Smartphone, ShieldCheck } from 'lucide-react'
import { SiteFooter, SiteHeader } from '../legal/LegalLayout'
import { PlanPicker } from '../plan/PlanCards'
import { ReviewsSection } from '../reviews/ReviewsSection'
import { REFERRED_TRIAL_DAYS, REFERRER_REWARD_DAYS, TRIAL_DAYS } from '../../types/growth'
import { ExampleJobs } from './ExampleJobs'
import { Faq, Features, HowItWorks, Section, VoicePrivacy } from './LandingSections'
import { TourVideo } from './TourVideo'
import { VoiceSamples } from './VoiceSamples'

export type StartMode = 'sign-up' | 'sign-in'

interface LandingProps {
  onStart: (mode: StartMode) => void
}

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#try', label: 'Try it' },
  { href: '#voices', label: 'Voices' },
  { href: '#reviews', label: 'Reviews' },
  { href: '#pricing', label: 'Pricing' },
] as const

/** The front page for people who are not signed in: what Volita does for tradespeople, a way to try it, and the plans. */
export function Landing({ onStart }: LandingProps) {
  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <nav aria-label="Page sections" className="flex items-center gap-1 sm:gap-3">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="muted hidden rounded-full px-3 py-1.5 text-sm font-semibold hover:text-(--ink) md:inline">
              {item.label}
            </a>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => onStart('sign-in')}>
            Sign in
          </button>
        </nav>
      </SiteHeader>

      <main>
        <section aria-labelledby="hero-heading" className="mx-auto grid max-w-5xl items-center gap-10 px-4 pt-8 pb-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-(--line) bg-(--surface) px-3 py-1 text-xs font-semibold">
              <Smartphone className="size-3.5 text-ember-400" aria-hidden="true" />
              For plumbers, electricians, builders and every small business
            </p>
            <h1 id="hero-heading" className="mt-5 text-5xl leading-[1.03] font-extrabold tracking-tight sm:text-6xl">
              Say the job.
              <br />
              <span className="text-gradient">Volita writes it.</span>
            </h1>
            <p className="muted mt-5 max-w-xl text-lg">
              Quotes, WhatsApps and emails written in your name from one sentence, while your hands are busy. Then a hands-free assistant that knows your day. No typing on site, no evenings spent on admin.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary px-6 py-3 text-base" onClick={() => onStart('sign-up')} data-testid="start-trial">
                Try Pro free for {TRIAL_DAYS} days
              </button>
              <a href="#try" className="btn btn-ghost px-6 py-3 text-base">
                See it write a quote
              </a>
            </div>
            <ul className="muted mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <li className="flex items-center gap-1.5">
                <Gift className="size-4 text-ember-400" aria-hidden="true" />
                No card needed
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-500" aria-hidden="true" />
                Your voice is never stored
              </li>
              <li className="flex items-center gap-1.5">
                <Smartphone className="size-4 text-ember-400" aria-hidden="true" />
                Works on your phone
              </li>
            </ul>
          </div>
          <TourVideo />
        </section>

        <Section id="how" title="From your mouth to your client in a minute" intro="Three steps, and you never have to open a keyboard.">
          <HowItWorks />
        </Section>

        <Section id="try" title="Try it right now" intro="No sign-up. Pick a trade, press the button and watch one spoken sentence become a finished draft.">
          <ExampleJobs onStart={() => onStart('sign-up')} />
        </Section>

        <Section id="voices" title="Hear the voices" intro="The assistant talks back. Press play to hear each natural voice, then pick your favourite inside the app.">
          <VoiceSamples />
        </Section>

        <Section id="features" title="Made for people who work with their hands">
          <Features />
        </Section>

        <Section id="privacy-note" title="Private by design">
          <VoicePrivacy />
        </Section>

        <Section id="reviews" title="What people say" intro="Real reviews from people using Volita. Reviews need an account, and only first names are shown.">
          <ReviewsSection signedIn={false} onStart={() => onStart('sign-up')} />
        </Section>

        <Section id="pricing" title="Simple pricing" intro="Start free. Try everything in Pro for 14 days, no card. Pay only if it earns its place.">
          <PlanPicker current={null} />
          <div className="surface mt-4 flex flex-col gap-2 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              <span className="font-bold">Bring a friend.</span> Anyone who joins with your invite link gets {REFERRED_TRIAL_DAYS} days of Pro free, and you get {REFERRER_REWARD_DAYS} extra days for each friend.
            </p>
            <button type="button" className="btn btn-primary shrink-0" onClick={() => onStart('sign-up')}>
              Start free
            </button>
          </div>
          <p className="muted mt-3 text-xs">Paid plans open soon. Until then the Free plan and the Pro trial are the way in.</p>
        </Section>

        <Section id="faq" title="Questions">
          <Faq />
        </Section>

        <section aria-label="Get started" className="mx-auto max-w-5xl px-4 pb-4">
          <div className="surface bg-linear-to-br from-ember-700/20 to-lagoon-500/10 p-8 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">Stop typing quotes at night.</h2>
            <p className="muted mx-auto mt-2 max-w-md">Start free, say your first job, and see how much of your evening you get back.</p>
            <button type="button" className="btn btn-primary mt-5 px-6 py-3 text-base" onClick={() => onStart('sign-up')}>
              Try Pro free for {TRIAL_DAYS} days
            </button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
