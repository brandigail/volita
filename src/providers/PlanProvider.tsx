import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authClient } from '../lib/auth-client'
import { fetchPlan } from '../lib/plan-api'
import type { PlanState } from '../types/plan-state'
import { planLimits } from '../types/plans'
import { PlanContext, type PlanContextValue } from './plan-context'

/** Loads the signed-in person's plan once and shares it, so every screen can show locks and the usage meter. */
export function PlanProvider({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession()
  const userId = session?.user.id
  const [loaded, setLoaded] = useState<{ userId: string; state: PlanState } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchPlan()
      .then((state) => !cancelled && setLoaded({ userId, state }))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId, reloadKey])

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])
  const state = userId && loaded?.userId === userId ? loaded.state : null

  const value = useMemo<PlanContextValue>(() => ({ state, limits: state?.limits ?? planLimits('free'), refresh }), [state, refresh])
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}
