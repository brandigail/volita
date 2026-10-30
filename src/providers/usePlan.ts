import { useContext } from 'react'
import { PlanContext, type PlanContextValue } from './plan-context'

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlan must be used within PlanProvider')
  return ctx
}
