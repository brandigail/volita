import { Gift, Timer } from 'lucide-react'
import { usePlan } from '../../providers/usePlan'
import { StartTrialButton } from './StartTrialButton'
import { daysLeft } from './trial'

/** The free Pro trial on the Profile screen: offered once, counted down while it runs, and a plain note when it is over. */
export function TrialCard() {
  const { state } = usePlan()
  if (!state || state.plan === 'pro' && state.source !== 'trial') return null
  const { trial } = state
  const running = state.source === 'trial' && trial.endsAt !== null

  if (running && trial.endsAt) {
    const left = daysLeft(trial.endsAt)
    return (
      <section aria-label="Pro trial" className="mt-6 flex items-start gap-3 rounded-2xl border border-ember-400/50 bg-ember-500/10 p-4 text-sm" data-testid="trial-running">
        <Timer className="mt-0.5 size-5 shrink-0 text-ember-400" aria-hidden="true" />
        <p>
          <span className="font-bold">You are on Pro, free.</span> {left} {left === 1 ? 'day' : 'days'} left of your trial. After that you go back to your own plan, and nothing you made is deleted.
        </p>
      </section>
    )
  }

  if (trial.available) {
    return (
      <section aria-label="Free Pro trial" className="mt-6 flex flex-col gap-3 rounded-2xl border border-ember-400/50 bg-ember-500/10 p-4" data-testid="trial-offer">
        <p className="flex items-start gap-3 text-sm">
          <Gift className="mt-0.5 size-5 shrink-0 text-ember-400" aria-hidden="true" />
          <span>
            <span className="font-bold">Try Pro free for {trial.lengthDays} days.</span> No card, nothing to cancel. Morning briefing, writing style, tone rewrites, web lookups, your email (Gmail, Outlook, Yahoo and more) and 300 drafts a day.
          </span>
        </p>
        <StartTrialButton className="btn btn-primary self-start" />
      </section>
    )
  }

  return (
    <p className="muted mt-6 text-sm" data-testid="trial-used">
      Your free Pro trial has ended. Everything you made is still here, and the Pro features are locked until you upgrade.
    </p>
  )
}
