import { lazy, Suspense, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import type { Tab } from './components/TabBar'
import { AuthScreen } from './features/auth/AuthScreen'
import { authClient } from './lib/auth-client'
import { GMAIL_RETURN_PARAM } from './types/gmail'
import { Landing, type StartMode } from './features/landing/Landing'
import { isKnownMember, rememberMember } from './features/landing/member'
import { PublicPage } from './features/legal/PublicPage'
import { bookingSlugFor, publicPageFor } from './lib/route'
import { referralFromSearch, rememberReferral } from './features/growth/referral'
import { useReferralClaim } from './features/growth/useReferralClaim'
import { useFeatures } from './lib/useFeatures'
import { useActivityReporting } from './lib/useActivityReporting'
import { UnsentBanner } from './features/history/UnsentBanner'
import { NAVIGATE_EVENT } from './features/notifications/prefs'
import { useNotificationScheduler } from './features/notifications/useNotificationScheduler'
import { Onboarding } from './features/plan/Onboarding'
import { SharedChatDialog } from './features/share/SharedChatDialog'
import { SharedDialog } from './features/share/SharedDialog'
import { useSharedContent } from './features/share/useSharedContent'
import { GuidedTour } from './features/tour/GuidedTour'
import { highlight, hasSeenTour, markTourSeen } from './features/tour/highlight'
import { TOUR_STEPS, type TourStep } from './features/tour/steps'
import { AgeCheck } from './features/safety/AgeCheck'
import { SafetyNotice } from './features/safety/SafetyNotice'
import { isAdult } from './lib/age'
import { accountReady } from './lib/terms'
import { TermsGate } from './features/legal/TermsGate'

// The signed-in screens are loaded on demand, so a visitor on the landing page does not download the whole app first.
const AgendaView = lazy(() => import('./features/agenda/AgendaView').then((m) => ({ default: m.AgendaView })))
const AssistantView = lazy(() => import('./features/assistant/AssistantView').then((m) => ({ default: m.AssistantView })))
const BookingPage = lazy(() => import('./features/booking/BookingPage').then((m) => ({ default: m.BookingPage })))
const BusinessView = lazy(() => import('./features/business/BusinessView').then((m) => ({ default: m.BusinessView })))
const HistoryView = lazy(() => import('./features/history/HistoryView').then((m) => ({ default: m.HistoryView })))
const ProfileView = lazy(() => import('./features/profile/ProfileView').then((m) => ({ default: m.ProfileView })))
const RecordView = lazy(() => import('./features/record/RecordView').then((m) => ({ default: m.RecordView })))

export default function App() {
  // Coming back from PayFast, or from Google's or Microsoft's email permission screen, lands on the profile, where each is shown.
  const [gmailReturn] = useState(() => new URLSearchParams(window.location.search).get(GMAIL_RETURN_PARAM) ?? undefined)
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has('payment') || gmailReturn ? 'profile' : 'record'))
  const { data: session, isPending } = authClient.useSession()
  // An account gives its date of birth (older accounts) and goes through the terms before anything else loads or calls the server.
  const active = accountReady(session?.user)
  // A friend's invite link (/?ref=CODE) is remembered so it survives the sign-up form, then claimed once signed in.
  useState(() => {
    const code = referralFromSearch(window.location.search)
    if (code) rememberReferral(code)
  })
  useReferralClaim(active)
  // Signed-out visitors start on the landing page; its buttons open the sign-in or sign-up form.
  const [authMode, setAuthMode] = useState<StartMode | null>(null)
  const [knownMember] = useState(isKnownMember)
  useEffect(() => {
    if (session) rememberMember()
  }, [session])
  const features = useFeatures(active)
  useActivityReporting(active, tab)
  useNotificationScheduler(active)
  const { shared, clear: clearShared } = useSharedContent(active)

  // The result code is shown once, then removed from the address so a refresh does not repeat it.
  useEffect(() => {
    if (!gmailReturn) return
    const url = new URL(window.location.href)
    url.searchParams.delete(GMAIL_RETURN_PARAM)
    window.history.replaceState(null, '', url)
    const timer = window.setTimeout(() => document.getElementById('email')?.scrollIntoView({ behavior: 'smooth' }), 600)
    return () => window.clearTimeout(timer)
  }, [gmailReturn])

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
  const userId = active ? session?.user?.id : undefined
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

  const bookingSlug = bookingSlugFor(window.location.pathname)
  if (bookingSlug) {
    return (
      <Suspense fallback={null}>
        <BookingPage slug={bookingSlug} />
      </Suspense>
    )
  }
  const publicPage = publicPageFor(window.location.pathname)
  if (publicPage) return <PublicPage page={publicPage} />
  if (!session && authMode === null && (!isPending || !knownMember)) return <Landing onStart={setAuthMode} />

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
      {active && tab === 'record' && (
        <UnsentBanner
          onReview={() => {
            setHistoryOnUnsent(true)
            setTab('history')
          }}
        />
      )}
      <Suspense
        fallback={
          <p role="status" className="text-center text-slate-500 dark:text-slate-400">
            Loading…
          </p>
        }
      >
      {isPending ? (
        <p role="status" className="text-center text-slate-500 dark:text-slate-400">
          Loading…
        </p>
      ) : !session ? (
        <AuthScreen initialMode={authMode ?? 'sign-in'} onBack={() => setAuthMode(null)} />
      ) : !isAdult(session.user.birthDate) ? (
        <AgeCheck />
      ) : !active ? (
        <TermsGate />
      ) : tab === 'record' ? (
        <RecordView onNavigate={setTab} />
      ) : tab === 'assistant' ? (
        <AssistantView onNavigate={setTab} />
      ) : tab === 'agenda' ? (
        <AgendaView onNavigate={setTab} />
      ) : tab === 'business' ? (
        <BusinessView />
      ) : tab === 'history' ? (
        <HistoryView key={String(historyOnUnsent)} initialStatus={historyOnUnsent ? 'UNSENT' : 'ALL'} />
      ) : (
        <ProfileView user={session.user} showSubscriptions={features.subscriptions} activityLogged={features.activityLogged} gmailReturn={gmailReturn} />
      )}
      </Suspense>
      {active && <Onboarding />}
      {active && shared && (
        shared.kind === 'images' ? (
          <SharedChatDialog
            images={shared.images}
            onClose={clearShared}
            onSeePlans={openPlans}
            onSaved={() => {
              clearShared()
              setHistoryOnUnsent(false)
              setTab('history')
            }}
          />
        ) : (
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
        )
      )}
      {active && (
        <GuidedTour open={tourOpen} step={tourStep} onStep={setTourStep} onFinish={finishTour} onShow={showStep} />
      )}
      {active && resumeAt !== null && !tourOpen && (
        <button
          type="button"
          onClick={resumeTour}
          className="btn btn-primary fixed bottom-24 left-1/2 z-30 -translate-x-1/2 shadow-2xl"
        >
          Back to the tour
        </button>
      )}
      <SafetyNotice />
    </AppShell>
  )
}
