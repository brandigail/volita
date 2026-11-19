import { LifeBuoy, Mail } from 'lucide-react'
import { SITE, supportMailto } from '../../config/site'
import { LegalLayout } from './LegalLayout'

const HELP: { question: string; answer: string }[] = [
  { question: 'It will not let me record.', answer: 'Allow the microphone for Volita in your browser or phone settings, then reload. On an iPhone, open Volita from the Home Screen icon. The Check my phone page (volita.netlify.app/check) tests this for you in about a minute.' },
  { question: 'Can Volita read my WhatsApp messages on an iPhone?', answer: 'No. Apple does not let any app read WhatsApp on an iPhone. Volita can do it in its Android app, where you say "catch me up with John" and it reads what came in. On an iPhone, take a screenshot of the chat and add it on the Record tab, and Volita reads that.' },
  { question: 'I forgot my password.', answer: 'Email us from the address you signed up with and we will help you back in.' },
  { question: 'How do I delete my account and everything in it?', answer: 'Open Profile, scroll to the end and choose Delete my account and data. You can download a copy of your data first.' },
  { question: 'How do I get the free Pro trial?', answer: 'Open Profile and tap Try Pro free. It needs no card and lasts 14 days.' },
  { question: 'My email says it needs connecting again.', answer: 'While Volita is being tested, Google ends the Gmail permission after about a week. For Yahoo, AOL, iCloud and business email it happens when the app password is cancelled or changed. Open Profile, Your email, and connect again.' },
]

export function SupportPage() {
  return (
    <LegalLayout title="Support" intro="A real person reads every message.">
      <section className="surface p-5">
        <h2 className="flex items-center gap-2">
          <Mail className="size-5 text-brand-400" aria-hidden="true" />
          Email us
        </h2>
        <p>
          <a className="text-lg font-bold underline" href={supportMailto('Volita support')}>
            {SITE.supportEmail}
          </a>
        </p>
        <p className="muted text-sm">Tell us what you were doing, what you expected and what happened, and which phone or browser you use. We aim to reply within two working days.</p>
      </section>

      <section>
        <h2 className="flex items-center gap-2">
          <LifeBuoy className="size-5 text-brand-400" aria-hidden="true" />
          Quick answers
        </h2>
        <dl className="space-y-4">
          {HELP.map((item) => (
            <div key={item.question}>
              <dt className="font-semibold">{item.question}</dt>
              <dd className="muted">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="muted text-sm">
        Your privacy matters: see <a className="underline" href="/privacy">how your voice and data are handled</a>, and the <a className="underline" href="/terms">terms of use</a>.
      </p>
    </LegalLayout>
  )
}
