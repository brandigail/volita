import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import type { Tab } from './components/TabBar'
import { AuthScreen } from './features/auth/AuthScreen'
import { AgendaView } from './features/agenda/AgendaView'
import { AssistantView } from './features/assistant/AssistantView'
import { HistoryView } from './features/history/HistoryView'
import { ProfileView } from './features/profile/ProfileView'
import { RecordView } from './features/record/RecordView'
import { authClient } from './lib/auth-client'
import { useFeatures } from './lib/useFeatures'
import { useActivityReporting } from './lib/useActivityReporting'
import { UnsentBanner } from './features/history/UnsentBanner'
import { NAVIGATE_EVENT } from './features/notifications/prefs'
import { useNotificationScheduler } from './features/notifications/useNotificationScheduler'
import { Onboarding } from './features/plan/Onboarding'
import { SharedDialog } from './features/share/SharedDialog'
import { useSharedContent } from './features/share/useSharedContent'
import { GuidedTour } from './features/tour/GuidedTour'
import { highlight, hasSeenTour, markTourSeen } from './features/tour/highlight'
import { TOUR_STEPS, type TourStep } from './features/tour/steps'

export default function App() {
  // Coming back from PayFast lands on the profile, where the subscription is shown.
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has('payment') ? 'profile' : 'record'))
  const { data: session, isPending } = authClient.useSession()
  const features = useFeatures(Boolean(session))
  useActivityReporting(Boolean(session), tab)
  useNotificationScheduler(Boolean(session))
  const { shared, clear: clearShared } = useSharedContent(Boolean(session))

  // Tapping a reminder on the phone opens the screen it is about.
  useEffect(() => {
    const onNavigate = (event: Event) => setTab((event as CustomEvent<Tab>).detail)
    window.addEventListener(NAVIGATE_EVENT, onNavigate)
    return () => window.removeEventListener(NAVIGATE_EVENT, onNavigate)
  }, [])

  const openPlans = () => {
    setHistoryOnUnsent(false)
    setTab('profile')
    window.setTimeout(() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' }), 400)
  }

  // The tour opens by itself the first time someone signs in on this device; the "?" button opens it again.
  const userId = session?.user.id
  const [tourRequested, setTourRequested] = useState<boolean | undefined>(undefined)
  const [tourStep, setTourStep] = useState(0)
  /** Set when the unsent reminder opens History, so it lands on the "To send" list. */
  const [historyOnUnsent, setHistoryOnUnsent] = useState(false)
  /** Where to carry on from after a "Show me" visit to a real screen; null when no tour is waiting. */
  const [resumeAt, setResumeAt] = useState<number | null>(null)
  const tourOpen = userId !== undefined && (tourRequested ?? !hasSeenTour(userId))

  const finishTour = () => {
    if (userId) markTourSeen(userId)
    setTourRequested(false)
    setTourStep(0)
    setResumeAt(null)
  }
  const showStep = (step: TourStep, index: number) => {
    if (!step.show || !userId) return
    markTourSeen(userId)
    setTourRequested(false)
    setTab(step.show.tab)
    setResumeAt(index + 1 < TOUR_STEPS.length ? index + 1 : null)
    window.setTimeout(() => highlight(step.show?.target ?? ''), 600)
  }
  const openTour = () => {
    setTourStep(0)
    setResumeAt(null)
    setTourRequested(true)
  }
  const resumeTour = () => {
    setTourStep(resumeAt ?? 0)
    setResumeAt(null)
    setTourRequested(true)
  }

  return (
    <AppShell
      activeTab={tab}
      onTabChange={(next) => {
        setHistoryOnUnsent(false)
        setTab(next)
      }}
      signedIn={Boolean(session)}
      onHelp={openTour}
      onPlan={openPlans}
    >
      {session && tab === 'record' && (
        <UnsentBanner
          onReview={() => {
            setHistoryOnUnsent(true)
            setTab('history')
          }}
        />
      )}
      {isPending ? (
        <p role="status" className="text-center text-slate-500 dark:text-slate-400">
          Loading…
        </p>
      ) : !session ? (
        <AuthScreen />
      ) : tab === 'record' ? (
        <RecordView onNavigate={setTab} />
      ) : tab === 'assistant' ? (
        <AssistantView onNavigate={setTab} />
      ) : tab === 'agenda' ? (
        <AgendaView onNavigate={setTab} />
      ) : tab === 'history' ? (
        <HistoryView key={String(historyOnUnsent)} initialStatus={historyOnUnsent ? 'UNSENT' : 'ALL'} />
      ) : (
        <ProfileView user={session.user} showSubscriptions={features.subscriptions} activityLogged={features.activityLogged} />
      )}
      {session && <Onboarding />}
      {session && shared && (
        <SharedDialog
          shared={shared}
          onClose={clearShared}
          onSeePlans={openPlans}
          onSaved={() => {
            clearShared()
            setHistoryOnUnsent(false)
            setTab('history')
          }}
        />
      )}
      {session && (
        <GuidedTour open={tourOpen} step={tourStep} onStep={setTourStep} onFinish={finishTour} onShow={showStep} />
      )}
      {session && resumeAt !== null && !tourOpen && (
        <button
          type="button"
          onClick={resumeTour}
          className="btn btn-primary fixed bottom-24 left-1/2 z-30 -translate-x-1/2 shadow-2xl"
        >
          Back to the tour
        </button>
      )}
    </AppShell>
  )
}
