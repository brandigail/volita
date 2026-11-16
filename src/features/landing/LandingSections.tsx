import { CalendarDays, FileText, Globe, Languages, MessageCircle, Mic, ShieldCheck, Smartphone, Sunrise, Users } from 'lucide-react'
import type { ReactNode } from 'react'

export function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mx-auto max-w-5xl scroll-mt-20 px-4 py-12">
      <h2 id={`${id}-heading`} className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="muted mt-2 max-w-2xl text-lg">{intro}</p>}
      <div className="mt-8">{children}</div>
    </section>
  )
}

const STEPS = [
  { title: 'Pick what you are writing', text: 'A quote, a WhatsApp, an email, an SMS or a note. Volita knows how each one should sound.' },
  { title: 'Say it like you would to a mate', text: 'Tap the microphone and say the job, the prices and who it is for. No typing with dusty hands.' },
  { title: 'Check it and send it', text: 'Read the draft, change anything, then send it from your own WhatsApp, Gmail, Outlook or phone.' },
] as const

export function HowItWorks() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {STEPS.map((step, index) => (
        <li key={step.title} className="surface p-5">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-linear-to-br from-ember-700 to-ember-500 font-extrabold text-white">{index + 1}</span>
          <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
          <p className="muted mt-1">{step.text}</p>
        </li>
      ))}
    </ol>
  )
}

const FEATURES: { icon: typeof Mic; title: string; text: string }[] = [
  { icon: FileText, title: 'Quotes that add up', text: 'Say the items and prices. Volita lists them, adds the VAT and the total, and can make a PDF.' },
  { icon: MessageCircle, title: 'Messages in your voice', text: 'WhatsApp, SMS, email and social posts, signed with your name and business every time.' },
  { icon: Sunrise, title: 'A hands-free assistant', text: 'Ask what is on today, which quotes nobody answered, or what you told Mrs Jones. It answers out loud.' },
  { icon: Users, title: 'It remembers your clients', text: 'Saved prices, names and preferences, so you stop repeating yourself on every job.' },
  { icon: CalendarDays, title: 'Your agenda, one place', text: 'Link your Google, Outlook or Apple calendar, add meetings by voice and set send-later reminders.' },
  { icon: Languages, title: 'Speak your language', text: 'Talk in English, Afrikaans, Spanish and many more, and get a draft in the language the client reads.' },
  { icon: Smartphone, title: 'Works like an app', text: 'Install it on your Android or iPhone home screen. No app store, nothing heavy.' },
  { icon: Globe, title: 'Built for small businesses', text: 'Plumbers, electricians, builders, cleaners, landscapers, mechanics: anyone who is busy doing the work.' },
]

export function Features() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map(({ icon: Icon, title, text }) => (
        <li key={title} className="surface p-5">
          <Icon className="size-6 text-ember-400" aria-hidden="true" />
          <h3 className="mt-3 font-bold">{title}</h3>
          <p className="muted mt-1 text-sm">{text}</p>
        </li>
      ))}
    </ul>
  )
}

/** The line on how voice data is handled, on the front page as well as in the privacy policy. */
export function VoicePrivacy() {
  return (
    <div className="surface flex flex-col gap-3 border-emerald-500/40 p-6 sm:flex-row sm:items-start" data-testid="voice-privacy">
      <ShieldCheck className="size-8 shrink-0 text-emerald-500" aria-hidden="true" />
      <div>
        <h3 className="text-lg font-bold">Your voice is not stored</h3>
        <p className="muted mt-1">
          Your recording is sent securely to be turned into text and then discarded. Volita does not keep the audio, and our speech service has zero data retention switched on. The text of your drafts is
          encrypted, so only your account can read it. You can delete any draft or your whole account at any time.{' '}
          <a href="/privacy" className="font-semibold underline">
            Read how your data is handled
          </a>
          .
        </p>
      </div>
    </div>
  )
}

const FAQ = [
  { q: 'Do I need a card to try it?', a: 'No. The Pro trial is 14 days with no card, and the Free plan stays free.' },
  { q: 'Does Volita keep my voice recordings?', a: 'No. The audio is turned into text and thrown away. Only the text of your draft is kept, encrypted.' },
  { q: 'Which phones does it work on?', a: 'Any recent Android phone or iPhone, and any computer. Open it in the browser and add it to your home screen.' },
  { q: 'Will it get my prices and spelling right?', a: 'It writes from what you say and what it has learned about you, but it is an AI: always read a draft and check the numbers before you send.' },
  { q: 'Can I connect my Gmail?', a: 'Yes, on Pro. It can find and read emails when you ask and write replies, but it never sends anything unless you tap Send.' },
  { q: 'What happens when the trial ends?', a: 'You go back to the plan you were on. Everything you made is kept; the Pro features are locked until you upgrade.' },
] as const

export function Faq() {
  return (
    <dl className="grid gap-4 md:grid-cols-2">
      {FAQ.map((item) => (
        <div key={item.q} className="surface p-5">
          <dt className="font-bold">{item.q}</dt>
          <dd className="muted mt-1.5">{item.a}</dd>
        </div>
      ))}
    </dl>
  )
}
