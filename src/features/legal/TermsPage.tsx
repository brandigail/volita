import { SITE } from '../../config/site'
import { REFERRED_TRIAL_DAYS, REFERRER_REWARD_DAYS, MAX_REWARDED_REFERRALS, TRIAL_DAYS } from '../../types/growth'
import { MIN_AGE } from '../../lib/age'
import { STRIKE_LIMIT } from '../../types/safety'
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
        <h2>Adults only ({MIN_AGE} and over)</h2>
        <p>
          {SITE.name} is only for people aged {MIN_AGE} and over. You give your date of birth when you create an account, and it must be true. If we learn that an account belongs to someone under{' '}
          {MIN_AGE}, we close it.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>Give true details. Keep your password to yourself; you are responsible for what happens under your account.</li>
          <li>One person per account. Do not create several accounts to get around a limit, to repeat the free trial or to come back after an account was closed.</li>
          <li>You can delete your account in Profile at any time.</li>
        </ul>
      </section>

      <section>
        <h2>Card numbers, bank details and passwords are not allowed</h2>
        <p>
          Never say or type card numbers, bank account details (account numbers, branch codes, IBAN or SWIFT codes), passwords, PINs or one-time codes into {SITE.name}, whether they are yours or someone
          else&apos;s. {SITE.name} checks for them before anything is sent to the AI or saved. When it finds them, it stops, shows a warning that it cannot send this, and does not send or keep the text.
          Each try is counted. After {STRIKE_LIMIT} tries in 30 days the owner is told, and the account may be closed.
        </p>
      </section>

      <section>
        <h2>No spam, and no getting around limits or security</h2>
        <ul>
          <li>Do not use {SITE.name} to break the law, to harass or deceive people, or to send spam or bulk email. {SITE.name} sends at most 40 emails a day for you.</li>
          <li>
            Do not try to get past the daily limits, the plan locks or the security: no scripts or bots, no repeated attempts after being refused, no fake accounts, and no attempts to reach other
            people&apos;s data.
          </li>
          <li>
            {SITE.name} watches for this automatically. It records what kind of thing was stopped and when (never what you said or typed), and the owner is warned when an account keeps being stopped.
          </li>
        </ul>
      </section>

      <section>
        <h2>When we close an account</h2>
        <p>
          We may close an account that breaks these terms, straight away and without warning if the breach is serious or keeps happening. A closed account is signed out everywhere and cannot sign in again.
          If you think we made a mistake, write to <a className="underline" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> and we will look at it. Anything you paid for and could not use
          because of a mistake on our side will be refunded.
        </p>
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
