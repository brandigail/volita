import { Crown } from 'lucide-react'
import { usePlan } from '../../providers/usePlan'
import { PLAN_RANK } from '../../types/plans'
import { PlanPicker } from './PlanCards'

/** The three plans side by side, with a note on how the current one was given. Buying is not open yet. */
export function PlansSection() {
  const { state } = usePlan()
  const current = state?.plan ?? 'free'

  return (
    <section aria-labelledby="plans-heading" id="plans" className="mt-10" data-tour="plans">
      <h2 id="plans-heading" className="text-2xl font-extrabold tracking-tight">
        Plans
      </h2>
      {state && (
        <p className="muted mt-1 text-sm">
          {state.source === 'owner' && (
            <>
              <Crown className="mr-1 inline size-4 text-ember-400" aria-hidden="true" />
              You run Volita, so you always have Pro.
            </>
          )}
          {state.source === 'grant' && 'Your plan was given to you for free by the owner.'}
          {state.source === 'subscription' && 'Your plan comes from your subscription.'}
          {state.source === 'trial' && 'You are trying Pro for free. Your own plan comes back when the trial ends.'}
          {state.source === 'default' && 'You are on the free plan. Paid plans open soon.'}
        </p>
      )}
      <PlanPicker current={state?.plan ?? null} />
      {state && PLAN_RANK[current] < PLAN_RANK.pro && (
        <p className="muted mt-3 text-xs">Limits count the last 24 hours. Your data is never deleted if you move to a smaller plan; features above it are just locked.</p>
      )}
    </section>
  )
}
