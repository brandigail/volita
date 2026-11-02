import { DRAFT_CATEGORIES, type DraftCategory } from './draft.ts'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.
// Limits are enforced on the server; the client only reads them to show locks, counters and upgrade prompts.

export type PlanId = 'free' | 'basic' | 'pro'
/** The plans that can be bought. Free is the default and needs no subscription. */
export type PaidPlanId = Exclude<PlanId, 'free'>

/** How much the voice assistant may do: look things up, then also write and change things, then also search the web. */
export type AssistantToolLevel = 'read' | 'standard' | 'full'

export interface PlanLimits {
  draftsPerDay: number
  /** Longest single recording. */
  recordingSeconds: number
  channels: readonly DraftCategory[]
  /** False means English only (speaking and writing). */
  anyLanguage: boolean
  assistantTurnsPerDay: number
  /** Turns a month that use the hosted premium voice; after that the device voice is used. */
  premiumVoicePerMonth: number
  webLookupsPerDay: number
  assistantTools: AssistantToolLevel
  /** Most memories and most saved people; null means no cap. Zero means the feature is locked. */
  memoryItems: number | null
  contacts: number | null
  /** Most drafts shown in History; null means all of them. Older ones are kept, not deleted. */
  historyDrafts: number | null
  sendAtReminders: boolean
  /** How many iCal calendars can be linked. */
  calendars: number
  /** Free drafts carry a "Written with Volita" line. */
  footer: boolean
  templates: boolean
  priceList: boolean
  photoCaption: boolean
  quotePdf: boolean
  followUps: boolean
  morningBriefing: boolean
  toneRewrite: boolean
  writingStyle: boolean
}

export interface Plan {
  id: PlanId
  name: string
  /** Price per month in US dollars; every other currency is converted from this. */
  usdPerMonth: number
  /** Price when billed yearly, in US dollars. */
  usdPerYear: number
  /** One line for the plan card. */
  pitch: string
  perks: readonly string[]
  limits: PlanLimits
}

export const FOOTER_TEXT = 'Written with Volita'

const LOCKED_CHANNELS: readonly DraftCategory[] = ['EMAIL', 'WHATSAPP', 'NOTE']

const FREE: PlanLimits = {
  draftsPerDay: 3,
  recordingSeconds: 60,
  channels: LOCKED_CHANNELS,
  anyLanguage: false,
  assistantTurnsPerDay: 5,
  premiumVoicePerMonth: 0,
  webLookupsPerDay: 0,
  assistantTools: 'read',
  memoryItems: 0,
  contacts: 0,
  historyDrafts: 20,
  sendAtReminders: false,
  calendars: 0,
  footer: true,
  templates: false,
  priceList: false,
  photoCaption: false,
  quotePdf: false,
  followUps: false,
  morningBriefing: false,
  toneRewrite: false,
  writingStyle: false,
}

const BASIC: PlanLimits = {
  draftsPerDay: 15,
  recordingSeconds: 120,
  channels: DRAFT_CATEGORIES,
  anyLanguage: true,
  assistantTurnsPerDay: 30,
  premiumVoicePerMonth: 200,
  webLookupsPerDay: 0,
  assistantTools: 'standard',
  memoryItems: 25,
  contacts: 25,
  historyDrafts: null,
  sendAtReminders: true,
  calendars: 1,
  footer: false,
  templates: true,
  priceList: true,
  photoCaption: true,
  quotePdf: true,
  followUps: true,
  morningBriefing: false,
  toneRewrite: false,
  writingStyle: false,
}

const PRO: PlanLimits = {
  ...BASIC,
  draftsPerDay: 100,
  recordingSeconds: 300,
  assistantTurnsPerDay: 100,
  premiumVoicePerMonth: 600,
  webLookupsPerDay: 30,
  assistantTools: 'full',
  memoryItems: null,
  contacts: null,
  calendars: 3,
  morningBriefing: true,
  toneRewrite: true,
  writingStyle: true,
}

export const FREE_PLAN: Plan = {
  id: 'free',
  name: 'Free',
  usdPerMonth: 0,
  usdPerYear: 0,
  pitch: 'Try it properly in one sitting.',
  perks: ['3 voice drafts a day, up to 1 minute each', 'Email, WhatsApp and Note', 'Assistant: 5 turns a day, reads your agenda and finds drafts', 'Last 20 drafts in History', 'English only'],
  limits: FREE,
}

/** The plans that can be bought, which is also what the subscription screen and payment code work with. */
export const PLANS: readonly (Plan & { id: PaidPlanId })[] = [
  {
    id: 'basic',
    name: 'Basic',
    usdPerMonth: 5,
    usdPerYear: 50,
    pitch: 'My phone writes my client messages.',
    perks: [
      'All 8 channels: quotes, SMS, Instagram, Facebook and TikTok too',
      '15 drafts a day, up to 2 minutes each, any language, with translation',
      'Assistant that writes drafts, schedules sends and adds meetings: 30 turns a day',
      'Premium voice for 200 turns a month',
      'Memory for 25 notes and 25 people, templates, a price list and quote PDFs',
      '"Send at" reminders, one linked calendar, no Volita footer',
    ],
    limits: BASIC,
  },
  {
    id: 'pro',
    name: 'Pro',
    usdPerMonth: 12,
    usdPerYear: 99,
    pitch: 'It runs my admin.',
    perks: [
      'Everything in Basic',
      '100 drafts a day, up to 5 minutes each',
      '100 assistant turns a day, 600 premium voice turns a month, web lookups',
      'Unlimited memory and people',
      'Morning briefing, rewrite in a different tone, learns your writing style',
      'Up to 3 linked calendars and priority support',
    ],
    limits: PRO,
  },
]

export const ALL_PLANS: readonly Plan[] = [FREE_PLAN, ...PLANS]

const BY_ID = new Map<PlanId, Plan>(ALL_PLANS.map((plan) => [plan.id, plan]))

export function planFor(id: PlanId): Plan {
  const plan = BY_ID.get(id)
  if (!plan) throw new Error(`Unknown plan: ${id}`)
  return plan
}

export function planLimits(id: PlanId): PlanLimits {
  return planFor(id).limits
}

export const PLAN_RANK: Record<PlanId, number> = { free: 0, basic: 1, pro: 2 }

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'basic' || value === 'pro'
}

/** The cheapest plan that unlocks a channel, for the upgrade prompt. */
export function planForChannel(channel: DraftCategory): PlanId {
  return FREE.channels.includes(channel) ? 'free' : 'basic'
}

/** One transcription call covers a clip of at most this many seconds (see useAudioRecorder). */
export const CLIP_SECONDS = 45

/** Transcription calls one recording needs at most, which is how recording length is metered on the server. */
export function clipsPerRecording(plan: PlanId): number {
  return Math.ceil(planLimits(plan).recordingSeconds / CLIP_SECONDS)
}

export interface RatesResponse {
  base: 'USD'
  /** Units of each currency that one US dollar buys. */
  rates: Record<string, number>
  /** The day the rates were published. */
  asOf: string
  source: string
}

export interface Currency {
  code: string
  name: string
}

/** Currencies offered in the picker. A currency whose rate can't be fetched is simply left out. */
export const CURRENCIES: readonly Currency[] = [
  { code: 'USD', name: 'US dollar' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'NAD', name: 'Namibian dollar' },
  { code: 'BWP', name: 'Botswana pula' },
  { code: 'NGN', name: 'Nigerian naira' },
  { code: 'KES', name: 'Kenyan shilling' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'INR', name: 'Indian rupee' },
]
