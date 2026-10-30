import type { Tab } from '../components/TabBar'
import { NAVIGATE_EVENT } from '../features/notifications/prefs'

/** Opens a tab from anywhere in the app, without passing a callback through every screen. */
export function goToTab(tab: Tab): void {
  window.dispatchEvent(new CustomEvent<Tab>(NAVIGATE_EVENT, { detail: tab }))
}

/** Opens the Profile tab and scrolls to the plans, for "see the plans" links. */
export function goToPlans(): void {
  goToTab('profile')
  window.setTimeout(() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' }), 400)
}
