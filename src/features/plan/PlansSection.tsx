import { Check, Crown } from 'lucide-react'
import { usePlan } from '../../providers/usePlan'
import { ALL_PLANS, PLAN_RANK, type Plan } from '../../types/plans'

const money = (usd: number) => (usd === 0 ? 'Free' : `$${usd}`)

function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
  return (
    <div className={`surface flex flex-col gap-3 p-5 ${current ? 'ring-2 ring-violet-500' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{plan.name}</h3>
          <p className="muted text-xs">{plan.pitch}</p>
        </div>
        {current && <span className="rounded-full bg-violet-500 px-2.5 py-0.5 text-xs font-bold text-white">Your plan</span>}
      </div>
      <p className="text-3xl font-extrabold tracking-tight">
        {money(plan.usdPerMonth)}
        {plan.usdPerMonth > 0 && <span className="muted text-base font-medium"> / month</span>}
      </p>
      {plan.usdPerYear > 0 && <p className="muted -mt-2 text-xs">or ${plan.usdPerYear} a year</p>}
      <ul className="muted space-y-1.5 text-sm">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden="true" />
            {perk}
          </li>
        ))}
      </ul>
    </div>
  )
}

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
              <Crown className="mr-1 inline size-4 text-fuchsia-400" aria-hidden="true" />
              You run Apex Voice, so you always have Pro.
            </>
          )}
          {state.source === 'grant' && 'Your plan was given to you for free by the owner.'}
          {state.source === 'subscription' && 'Your plan comes from your subscription.'}
          {state.source === 'default' && 'You are on the free plan. Paid plans open soon.'}
        </p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {ALL_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} current={plan.id === current} />
        ))}
      </div>
      {state && PLAN_RANK[current] < PLAN_RANK.pro && (
        <p className="muted mt-3 text-xs">Limits count the last 24 hours. Your data is never deleted if you move to a smaller plan; features above it are just locked.</p>
      )}
    </section>
  )
}
