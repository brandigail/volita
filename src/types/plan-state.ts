import type { TrialState } from './growth.ts'
import type { PlanId, PlanLimits } from './plans.ts'
import type { SafetyCounts } from './safety.ts'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export type PlanSourceName = 'owner' | 'grant' | 'subscription' | 'trial' | 'default'

export interface PlanUsage {
  /** Drafts written in the last 24 hours and the plan's cap. */
  draftsUsed: number
  draftsLimit: number
  assistantUsed: number
  assistantLimit: number
  /** Premium voice turns used this calendar month and the plan's pool. */
  voiceUsed: number
  voiceLimit: number
}

/** Everything the app needs to show the plan, the usage meter and the locks. The server decides all of it. */
export interface PlanState {
  plan: PlanId
  source: PlanSourceName
  isOwner: boolean
  limits: PlanLimits
  usage: PlanUsage
  /** False until the three-question welcome has been finished or skipped. */
  onboarded: boolean
  /** The free Pro trial: whether it can be started, and when a running one ends. */
  trial: TrialState
}

/** One account as the owner sees it on the family screen. */
export interface AdminUser {
  id: string
  email: string
  name: string
  createdAt: string
  plan: PlanId
  source: PlanSourceName
  drafts: number
  lastActive: string | null
  /** When the owner closed the account; null while it is open. */
  suspendedAt: string | null
  /** What the safety checks stopped in the last 30 days. */
  safety: SafetyCounts
}

export interface AdminUsersResponse {
  users: AdminUser[]
}

export interface FollowUp {
  id: string
  recipient: string
  subject: string
  sentAt: string
  daysAgo: number
}

export interface BriefingMeeting {
  title: string
  startsAt: string
  allDay: boolean
}

/** The morning briefing. Parts the plan does not include are left out. */
export interface Briefing {
  meetings: BriefingMeeting[] | null
  /** Drafts planned to be sent that are now due or overdue. */
  overdue: { id: string; title: string; dueAt: string }[] | null
  followUps: FollowUp[] | null
  /** The whole briefing worded for reading or speaking. */
  summary: string
}
