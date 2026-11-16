import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { goToPlans } from '../../lib/navigation'
import { usePlan } from '../../providers/usePlan'
import { StartTrialButton } from './StartTrialButton'

interface LockedPreviewProps {
  title: string
  /** One sentence on what Pro does here. */
  pitch: string
  /** A realistic example of the feature, shown blurred behind the lock so people can see what they would get. */
  children: ReactNode
}

/** A Pro feature shown to people on other plans: a blurred example under a lock, with the way to try it free. */
export function LockedPreview({ title, pitch, children }: LockedPreviewProps) {
  const { state } = usePlan()
  const canTry = state?.trial.available ?? false

  return (
    <section aria-label={`${title} (Pro)`} className="surface relative w-full overflow-hidden p-5 text-left">
      <div aria-hidden="true" className="pointer-events-none blur-[3px] select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-(--surface)/70 p-4 text-center backdrop-blur-[1px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-3 py-1 text-xs font-extrabold text-white">
          <Lock className="size-3.5" aria-hidden="true" />
          Pro
        </span>
        <h3 className="text-base font-bold">{title}</h3>
        <p className="muted max-w-xs text-sm">{pitch}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {canTry && <StartTrialButton />}
          <button type="button" onClick={goToPlans} className="btn btn-ghost">
            See Pro
          </button>
        </div>
      </div>
    </section>
  )
}
