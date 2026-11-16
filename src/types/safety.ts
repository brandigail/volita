// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.
import type { SensitiveKind } from '../lib/sensitive.ts'

/** What a safety check stopped: protected details, hammering past the limits, or sending too many emails. */
export type SafetyKind = SensitiveKind | 'limit' | 'spam'

/** Tries with protected details in 30 days before the owner is told (and may close the account). */
export const STRIKE_LIMIT = 3

/** Why a request was refused, beyond the message: the app shows a pop-up for these. */
export type RefusalCode = 'sensitive' | 'suspended' | 'age_required'

/** One stopped attempt, as the owner sees it. Never includes what was typed or said. */
export interface SafetyEvent {
  id: number
  userId: string
  email: string
  name: string
  kind: SafetyKind
  source: string
  createdAt: string
}

/** A person's record over the last 30 days, shown next to them on the owner's screen. */
export interface SafetyCounts {
  sensitive: number
  limit: number
  spam: number
}

export const SAFETY_KIND_LABEL: Record<SafetyKind, string> = {
  card: 'Card number',
  bank: 'Bank details',
  password: 'Password or PIN',
  limit: 'Kept going past limits',
  spam: 'Too many emails',
}
