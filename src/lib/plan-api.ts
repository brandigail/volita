import { z } from 'zod'
import type { AdminUser, Briefing, PlanState } from '../types/plan-state'
import { serviceInputSchema, templateInputSchema, type Service, type ServiceInput, type Template, type TemplateInput } from '../types/pricing'
import { ApiRequestError, request } from './api'

const planIdSchema = z.enum(['free', 'basic', 'pro'])
const sourceSchema = z.enum(['owner', 'grant', 'subscription', 'default'])
const channelSchema = z.enum(['EMAIL', 'QUOTE', 'WHATSAPP', 'SMS', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'NOTE'])

const limitsSchema = z.object({
  draftsPerDay: z.number(),
  recordingSeconds: z.number(),
  channels: z.array(channelSchema),
  anyLanguage: z.boolean(),
  assistantTurnsPerDay: z.number(),
  premiumVoicePerMonth: z.number(),
  webLookupsPerDay: z.number(),
  assistantTools: z.enum(['read', 'standard', 'full']),
  memoryItems: z.number().nullable(),
  contacts: z.number().nullable(),
  historyDrafts: z.number().nullable(),
  sendAtReminders: z.boolean(),
  calendars: z.number(),
  footer: z.boolean(),
  templates: z.boolean(),
  priceList: z.boolean(),
  photoCaption: z.boolean(),
  quotePdf: z.boolean(),
  followUps: z.boolean(),
  morningBriefing: z.boolean(),
  toneRewrite: z.boolean(),
  writingStyle: z.boolean(),
})

const planStateSchema = z.object({
  plan: planIdSchema,
  source: sourceSchema,
  isOwner: z.boolean(),
  limits: limitsSchema,
  usage: z.object({
    draftsUsed: z.number(),
    draftsLimit: z.number(),
    assistantUsed: z.number(),
    assistantLimit: z.number(),
    voiceUsed: z.number(),
    voiceLimit: z.number(),
  }),
  onboarded: z.boolean(),
})

const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  createdAt: z.string(),
  plan: planIdSchema,
  source: sourceSchema,
  drafts: z.number(),
  lastActive: z.string().nullable(),
})

const briefingSchema = z.object({
  meetings: z.array(z.object({ title: z.string(), startsAt: z.string(), allDay: z.boolean() })).nullable(),
  overdue: z.array(z.object({ id: z.string(), title: z.string(), dueAt: z.string() })).nullable(),
  followUps: z
    .array(z.object({ id: z.string(), recipient: z.string(), subject: z.string(), sentAt: z.string(), daysAgo: z.number() }))
    .nullable(),
  summary: z.string(),
})

const serviceSchema = z.object({ id: z.string(), name: z.string(), price: z.string(), note: z.string() })
const templateSchema = z.object({ id: z.string(), title: z.string(), content: z.string() })

const unexpected = () => new ApiRequestError(502, 'The server sent an unexpected response.')
const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function fetchPlan(): Promise<PlanState> {
  const data = planStateSchema.safeParse(await request('/api/plan', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data
}

export async function finishOnboarding(answers: { audience?: string; tone?: string }): Promise<void> {
  await request('/api/onboarding', json(answers))
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const data = z.object({ users: z.array(adminUserSchema) }).safeParse(await request('/api/admin/users', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data.users
}

export async function setUserPlan(id: string, plan: 'free' | 'basic' | 'pro'): Promise<AdminUser> {
  const data = z.object({ user: adminUserSchema }).safeParse(await request(`/api/admin/users/${id}`, { method: 'PUT', ...json({ plan }) }))
  if (!data.success) throw unexpected()
  return data.data.user
}

export async function fetchBriefing(timeZone: string): Promise<Briefing> {
  const data = briefingSchema.safeParse(await request(`/api/briefing?tz=${encodeURIComponent(timeZone)}`, { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data
}

/** Asks Apex to learn the writing style from edited, sent drafts (Pro). */
export async function learnStyle(): Promise<{ learned: number; message: string }> {
  const data = z.object({ learned: z.number(), message: z.string() }).safeParse(await request('/api/style', { method: 'POST' }))
  if (!data.success) throw unexpected()
  return data.data
}

export async function fetchTemplates(): Promise<Template[]> {
  const data = z.object({ templates: z.array(templateSchema) }).safeParse(await request('/api/templates', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data.templates
}

export async function addTemplate(input: TemplateInput): Promise<Template> {
  const data = templateSchema.safeParse(await request('/api/templates', json(templateInputSchema.parse(input))))
  if (!data.success) throw unexpected()
  return data.data
}

export async function deleteTemplate(id: string): Promise<void> {
  await request(`/api/templates/${id}`, { method: 'DELETE' })
}

export async function fetchServices(): Promise<Service[]> {
  const data = z.object({ services: z.array(serviceSchema) }).safeParse(await request('/api/services', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data.services
}

export async function addService(input: ServiceInput): Promise<Service> {
  const data = serviceSchema.safeParse(await request('/api/services', json(serviceInputSchema.parse(input))))
  if (!data.success) throw unexpected()
  return data.data
}

export async function deleteService(id: string): Promise<void> {
  await request(`/api/services/${id}`, { method: 'DELETE' })
}

export async function captionPhoto(image: string, category: string, note: string): Promise<z.infer<typeof captionSchema>> {
  const data = captionSchema.safeParse(await request('/api/caption', json({ image, category, note })))
  if (!data.success) throw unexpected()
  return data.data
}

const captionSchema = z.object({
  draft: z.object({ category: channelSchema, recipient: z.string(), subject: z.string(), body: z.string(), language: z.string() }),
})

const calendarsSchema = z.object({ calendars: z.array(z.object({ host: z.string() })), max: z.number(), inactive: z.number() })
export type CalendarsInfo = z.infer<typeof calendarsSchema>

export async function fetchCalendars(): Promise<CalendarsInfo> {
  const data = calendarsSchema.safeParse(await request('/api/calendars', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data
}

export async function addCalendar(url: string): Promise<CalendarsInfo> {
  const data = calendarsSchema.safeParse(await request('/api/calendars', json({ url })))
  if (!data.success) throw unexpected()
  return data.data
}

export async function removeCalendar(index: number): Promise<CalendarsInfo> {
  const data = calendarsSchema.safeParse(await request('/api/calendars', { method: 'DELETE', ...json({ index }) }))
  if (!data.success) throw unexpected()
  return data.data
}

const invitesSchema = z.object({
  invites: z.array(z.object({ email: z.string(), plan: z.enum(['basic', 'pro']), createdAt: z.string(), signedUp: z.boolean() })),
})
export type PlanInvite = z.infer<typeof invitesSchema>['invites'][number]

export async function fetchInvites(): Promise<PlanInvite[]> {
  const data = invitesSchema.safeParse(await request('/api/admin/invites', { method: 'GET' }))
  if (!data.success) throw unexpected()
  return data.data.invites
}

/** Gives a plan to emails that have not signed up yet (or already have); returns how many were added and which were not valid emails. */
export async function addInvites(emails: string, plan: 'basic' | 'pro'): Promise<{ added: number; invalid: string[] }> {
  const data = z.object({ added: z.number(), invalid: z.array(z.string()) }).safeParse(await request('/api/admin/invites', json({ emails, plan })))
  if (!data.success) throw unexpected()
  return data.data
}

export async function removeInvite(email: string): Promise<void> {
  await request('/api/admin/invites', { method: 'DELETE', ...json({ email }) })
}
