import { Check, Copy, Share2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchReferral } from '../../lib/growth-api'
import { REFERRED_TRIAL_DAYS, REFERRER_REWARD_DAYS } from '../../types/growth'
import { referralLink } from '../growth/referral'

interface ReferralInfo {
  code: string
  rewardedFriends: number
  daysEarned: number
  maxFriends: number
}

/** Invite a friend or a family member: they get a longer free trial and you get free Pro days. */
export function ReferralCard() {
  const [info, setInfo] = useState<ReferralInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchReferral()
      .then((loaded) => !cancelled && setInfo(loaded))
      .catch(() => !cancelled && setError('Could not load your invite link. Please try again later.'))
    return () => {
      cancelled = true
    }
  }, [])

  const link = info ? referralLink(window.location.origin, info.code) : ''
  const message = `I use Volita to turn what I say into quotes, messages and emails. Try it free for ${REFERRED_TRIAL_DAYS} days: ${link}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Could not copy. Select the link and copy it yourself.')
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Volita', text: message, url: link })
    } catch {
      // the person closed the share sheet: nothing to do
    }
  }

  return (
    <section aria-labelledby="referral-heading" className="mt-10" id="invite" data-testid="referral-card">
      <h2 id="referral-heading" className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Users className="size-6 text-brand-400" aria-hidden="true" />
        Invite a friend
      </h2>
      <p className="muted mt-1 mb-4 text-sm">
        They get {REFERRED_TRIAL_DAYS} days of Pro free instead of the usual trial. You get {REFERRER_REWARD_DAYS} extra days of Pro for every friend who signs up
        {info ? `, up to ${info.maxFriends} friends` : ''}.
      </p>
      <div className="surface space-y-3 p-5">
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-200">
            {error}
          </p>
        )}
        {!info && !error && <p className="muted text-sm">Loading your link…</p>}
        {info && (
          <>
            <div>
              <label htmlFor="referral-link" className="mb-1.5 block text-sm font-semibold">
                Your invite link
              </label>
              <input id="referral-link" readOnly value={link} className="field" onFocus={(event) => event.currentTarget.select()} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => void copy()}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              {typeof navigator.share === 'function' && (
                <button type="button" className="btn btn-ghost" onClick={() => void share()}>
                  <Share2 className="size-4" aria-hidden="true" />
                  Share
                </button>
              )}
            </div>
            <p className="muted text-sm" data-testid="referral-stats">
              {info.rewardedFriends === 0
                ? 'Nobody has joined through your link yet.'
                : `${info.rewardedFriends} of ${info.maxFriends} friends joined. You have earned ${info.daysEarned} days of Pro.`}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
