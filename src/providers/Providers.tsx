import type { ReactNode } from 'react'
import { PlanProvider } from './PlanProvider'
import { ThemeProvider } from './ThemeProvider'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PlanProvider>{children}</PlanProvider>
    </ThemeProvider>
  )
}
