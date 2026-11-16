import { Check } from 'lucide-react'
import { useState } from 'react'
import { ALL_PLANS, yearlyFreeMonthsText, type Plan, type PlanId } from '../../types/plans'

const money = (usd: number) => (usd === 0 ? 'Free' : `$${usd}`)

function PlanCard({ plan, current, yearly }: { plan: Plan; current: boolean; yearly: boolean }) {
  const showYearly = yearly && plan.usdPerYear > 0
  const free = yearlyFreeMonthsText(plan)
  return (
    <div className={`surface flex flex-col gap-3 p-5 ${current ? 'ring-2 ring-brand-500' : ''} ${plan.id === 'pro' ? 'border-ember-400/60' : ''}`} data-testid={`plan-${plan.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{plan.name}</h3>
          <p className="muted text-xs">{plan.pitch}</p>
        </div>
        {current && <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-bold text-white">Your plan</span>}
      </div>
      <p className="text-3xl font-extrabold tracking-tight">
        {showYearly ? money(plan.usdPerYear) : money(plan.usdPerMonth)}
        {plan.usdPerMonth > 0 && <span className="muted text-base font-medium"> / {showYearly ? 'year' : 'month'}</span>}
      </p>
      {showYearly && free && (
        <p className="-mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
          {free} (that is ${(plan.usdPerYear / 12).toFixed(2)} a month)
        </p>
      )}
      {!showYearly && plan.usdPerYear > 0 && <p className="muted -mt-2 text-xs">or ${plan.usdPerYear} a year</p>}
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

/** The three plans side by side with a monthly / yearly switch. `current` is the signed-in person's plan, or null on the public page. */
export function PlanPicker({ current }: { current: PlanId | null }) {
  const [yearly, setYearly] = useState(false)
  return (
    <>
      <div role="group" aria-label="Billing period" className="mt-4 inline-flex rounded-full border border-(--line) p-1 text-sm font-semibold">
        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className={`rounded-full px-4 py-1.5 ${!yearly ? 'bg-brand-500 text-white' : 'muted'}`}>
          Monthly
        </button>
        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className={`rounded-full px-4 py-1.5 ${yearly ? 'bg-brand-500 text-white' : 'muted'}`}>
          Yearly, 2+ months free
        </button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {ALL_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} current={plan.id === current} yearly={yearly} />
        ))}
      </div>
    </>
  )
}
