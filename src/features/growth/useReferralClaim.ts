import { useEffect } from 'react'
import { claimReferral } from '../../lib/growth-api'
import { usePlan } from '../../providers/usePlan'
import { forgetReferral, recalledReferral } from './referral'

/**
 * When someone signs up through a friend's link, the code saved from the address is handed to the server once they are
 * signed in. It is tried a single time and then forgotten whatever the answer, so a wrong or used code never repeats.
 */
export function useReferralClaim(signedIn: boolean): void {
  const { refresh } = usePlan()
  useEffect(() => {
    if (!signedIn) return
    const code = recalledReferral()
    if (!code) return
    forgetReferral()
    claimReferral(code)
      .then(() => refresh())
      .catch(() => undefined)
  }, [signedIn, refresh])
}
