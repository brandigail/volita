// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** Days of free Pro in the trial, and what a referral adds. One place, so the screens and the server never disagree. */
export const TRIAL_DAYS = 14
export const REFERRED_TRIAL_DAYS = 21
export const REFERRER_REWARD_DAYS = 14
export const MAX_REWARDED_REFERRALS = 6

export interface TrialState {
  /** When Pro access from a trial or referral ends, if it is still running. */
  endsAt: string | null
  /** True if this person can still start the free trial (once per account, and only if they are not already on Pro). */
  available: boolean
  /** How long their trial would be (longer when they joined through a friend's link). */
  lengthDays: number
}

export interface ReferralState {
  code: string
  rewardedFriends: number
  daysEarned: number
  maxFriends: number
}
