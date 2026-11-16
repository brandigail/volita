import { SITE } from '../../config/site'
import { REFERRED_TRIAL_DAYS, REFERRER_REWARD_DAYS, MAX_REWARDED_REFERRALS, TRIAL_DAYS } from '../../types/growth'
import { LegalLayout } from './LegalLayout'

/** The terms of use, in plain language. */
export function TermsPage() {
  return (
    <LegalLayout title="Terms of use" intro={`The rules for using ${SITE.name}. Last updated ${SITE.legalUpdated}.`}>
      <section>
        <h2>What {SITE.name} is</h2>
        <p>
          {SITE.name} turns what you say into drafts (quotes, messages, emails and notes) and helps you keep track of your day. It is run by {SITE.operator}. By creating an account or using the app you
          agree to these terms and to the <a className="underline" href="/privacy">Privacy page</a>.
        </p>
      </section>

      <section>
        <h2>You check what it writes</h2>
        <p>
          The drafts and answers are written by an AI and can be wrong: a price, a date, a name or a promise. Always read a draft before you send it, and check every number in a quote. You are responsible
          for what you send and to whom. {SITE.name} never sends an email for you unless you tap Send or say so.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must be at least 18 and give true details. Keep your password to yourself; you are responsible for what happens under your account.</li>
          <li>One person per account. Please do not create several accounts to get around a limit or to repeat the free trial.</li>
          <li>You can delete your account in Profile at any time. We may suspend an account that breaks these terms.</li>
        </ul>
      </section>

      <section>
        <h2>Using it properly</h2>
        <p>Do not use {SITE.name} to break the law, to harass or deceive people, to send spam, or to try to get past its limits or security. Do not dictate other people&apos;s bank details, card numbers or passwords into it.</p>
      </section>

      <section>
        <h2>Plans, the free trial and invites</h2>
        <ul>
          <li>There is a Free plan and paid Basic and Pro plans, each with daily limits shown on the Plans screen. Limits can be changed, and we will not take away something you have already paid for.</li>
          <li>
            The Pro free trial lasts {TRIAL_DAYS} days, needs no card, can be started once per account, and ends by itself. When it ends you go back to your own plan and nothing you made is deleted;
            the Pro features are locked again.
          </li>
          <li>
            Invite a friend: if a brand new account is created through your invite link, they get a {REFERRED_TRIAL_DAYS} day trial and you get {REFERRER_REWARD_DAYS} extra days of Pro, for up to{' '}
            {MAX_REWARDED_REFERRALS} friends. We may remove rewards that come from fake or repeat accounts.
          </li>
          <li>Paid plans are not open for payment yet. When they open, prices, how to cancel and refunds will be shown before you pay.</li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          What you say and write is yours. You allow us to process it, and to pass it to the services described in the Privacy page, only to run {SITE.name} for you. We do not claim any ownership of it.
        </p>
      </section>

      <section>
        <h2>Availability and our responsibility</h2>
        <p>
          We work to keep {SITE.name} running, but it depends on other services and may be slow, change or be unavailable at times. It is provided as it is. To the extent the law allows, we are not
          responsible for losses that come from an AI mistake you did not catch, from the service being unavailable, or from anything else outside our reasonable control, and our total responsibility for
          any claim is limited to what you paid us in the 12 months before it. Nothing here limits rights you have under South African consumer law that cannot be limited.
        </p>
      </section>

      <section>
        <h2>Changes, law and contact</h2>
        <p>
          We may update these terms; if the change matters we will tell you in the app, and carrying on after that means you accept it. These terms are governed by the laws of South Africa. Questions:{' '}
          <a className="underline" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
        </p>
      </section>
    </LegalLayout>
  )
}
