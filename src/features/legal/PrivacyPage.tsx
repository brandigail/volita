import { Mic } from 'lucide-react'
import { SITE } from '../../config/site'
import { MIN_AGE } from '../../lib/age'
import { LegalLayout } from './LegalLayout'

/** The privacy policy, in plain language. Every statement here describes what the app actually does today. */
export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy" intro={`How ${SITE.name} handles your information. Last updated ${SITE.legalUpdated}.`}>
      <section aria-labelledby="voice-heading" className="rounded-2xl border border-ember-400/50 bg-ember-500/10 p-5">
        <h2 id="voice-heading" className="flex items-center gap-2">
          <Mic className="size-5 text-ember-400" aria-hidden="true" />
          How your voice is handled
        </h2>
        <p>
          Your voice recording is sent securely to our speech service (Groq, in the United States) to be turned into text, and then it is discarded. {SITE.name} does not save the audio. The service has
          its zero data retention setting switched on for our account, which means it does not keep what you say or what it writes back once it has answered.
        </p>
        <p>The text that comes back is kept with your draft, scrambled (encrypted) so that only your account can read it. You can delete any draft, or your whole account, at any time.</p>
      </section>

      <section>
        <h2>Who we are</h2>
        <p>
          {SITE.name} is run by {SITE.operator}. For anything about your information, write to <a className="underline" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>. That address is
          also where to reach us as the person responsible for your information under South Africa&apos;s Protection of Personal Information Act (POPIA).
        </p>
      </section>

      <section>
        <h2>What we keep</h2>
        <ul>
          <li>Your account: name, email address and a password that is stored only as a one-way scrambled value, so nobody (including us) can read it.</li>
          <li>Your date of birth, to confirm you are {MIN_AGE} or over.</li>
          <li>
            A record of what the safety checks stopped: only the kind (for example &quot;card number&quot; or &quot;too many emails&quot;), where in the app and when. Never the text you said or typed. It is kept
            for 180 days so the owner can deal with misuse.
          </li>
          <li>Your profile: business name, role, phone number and sign-off, so drafts can be written and signed in your name.</li>
          <li>What you make: the text of your drafts, who they are for, your agenda items, the notes and people you ask Volita to remember, your price list and templates.</li>
          <li>Your conversations with the voice assistant, so you can look back at them.</li>
          <li>Counts of how much you have used, so the daily limits of your plan can be applied, and which plan or free trial you are on.</li>
          <li>If you use it, an invite link code and how many friends joined through it.</li>
        </ul>
        <p>We do not keep your voice recordings. We do not sell your information and we do not show adverts.</p>
      </section>

      <section>
        <h2>How it is protected</h2>
        <p>
          Everything travels over an encrypted connection. The text of your messages, transcripts, agenda items, notes and calendar link is encrypted before it is saved, with a separate key for each
          person, so another account cannot read it. Passwords are hashed.
        </p>
        <p>
          Card numbers, bank account details and passwords or PINs are not allowed in {SITE.name}. Everything you say or type is checked for them first. If any are found, the text is not sent to the AI,
          not saved and not logged; you see a warning instead. Please also keep ID numbers out of what you dictate.
        </p>
      </section>

      <section>
        <h2>Who handles it for us</h2>
        <p>We use a few other companies to run {SITE.name}. They process your information only to provide their part of the service. All of them keep data in the United States, so your information leaves South Africa.</p>
        <ul>
          <li>Groq: turns your voice into text, writes drafts and gives the assistant its natural voices.</li>
          <li>Neon: the database where your account and drafts are stored.</li>
          <li>Netlify: hosts the app and runs its server code.</li>
          <li>Your email company (Google, Microsoft, Yahoo, Apple or another): only if you choose to connect your email (see below).</li>
          <li>PayFast and Resend: payments and the emails about them, once paid plans open.</li>
        </ul>
      </section>

      <section>
        <h2>Your email, if you connect it</h2>
        <p>
          Connecting your email is optional and part of the Pro plan. You can connect Gmail or Outlook with their own sign-in page, where {SITE.name} asks only for permission to read and to send mail.
          For Yahoo, AOL, iCloud, Zoho and business email you give an app password (a separate password just for {SITE.name}, which you can cancel in your email account at any time) or your email
          password. {SITE.name} only reads and sends: it never deletes, moves or changes your mail.
        </p>
        <p>
          An email is read only when you ask the assistant about it. Its text is sent to our AI service for that one answer and is not saved by {SITE.name}. We never send an email without you: the
          assistant can only prepare it, and it is sent only when you tap Send or say &quot;send it&quot;. The sign-in or password is stored encrypted, you can see a record of what was read and sent, and
          &quot;Disconnect&quot; deletes it (for Gmail, Google is also told to forget the permission).
        </p>
      </section>

      <section>
        <h2>Testers</h2>
        <p>
          A few people who agree to help us test have a record of what they did in the app kept for a limited time, so problems can be found and fixed. They are told about it inside the app. Nobody else
          has this.
        </p>
      </section>

      <section>
        <h2>How long we keep it and your choices</h2>
        <p>
          We keep your information until you delete it. In Profile you can download everything we hold about you, and delete your account, which removes your drafts and everything linked to it. Under POPIA
          you may also ask to see, correct or delete your information, or object to how it is used: write to us and we will answer.
        </p>
      </section>

      <section>
        <h2>Cookies and storage on your device</h2>
        <p>
          We use one sign-in cookie to keep you signed in, and your device&apos;s own storage for your settings (such as the voice and theme you chose) and so the app works offline. We do not use tracking
          or advertising cookies.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          {SITE.name} is only for adults aged {MIN_AGE} and over. Everyone gives their date of birth when they create an account, and an account found to belong to someone under {MIN_AGE} is closed. We do
          not knowingly keep information about children.
        </p>
      </section>

      <section>
        <h2>Changes and complaints</h2>
        <p>
          If this page changes in a way that matters, we will say so in the app. If you are unhappy with how your information is handled, tell us first. You can also complain to South Africa&apos;s
          Information Regulator.
        </p>
      </section>
    </LegalLayout>
  )
}
