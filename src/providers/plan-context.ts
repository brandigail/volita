import { createContext } from 'react'
import type { PlanState } from '../types/plan-state'
import type { PlanLimits } from '../types/plans'

export interface PlanContextValue {
  /** The server's answer, or null while it loads or when nobody is signed in. */
  state: PlanState | null
  /** The limits to show locks and counters from; Free's until the server answers, so nothing is offered that may be refused. */
  limits: PlanLimits
  /** Asks the server again, for example after a draft was written so the usage meter moves. */
  refresh: () => void
}

export const PlanContext = createContext<PlanContextValue | null>(null)
