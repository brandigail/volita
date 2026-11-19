import { z } from 'zod'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const WEEKDAY_NAMES: Record<Weekday, string> = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' }

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

/** The hours the owner takes bookings on each day. A day that is missing is a day off. */
export const bookingHoursSchema = z.partialRecord(z.enum(WEEKDAYS), z.object({ start: clock, end: clock })).refine((hours) => Object.values(hours).every((day) => day.start < day.end), 'Each day must end after it starts.')
export type BookingHours = z.infer<typeof bookingHoursSchema>

export const BOOKING_LIMITS = { title: 80, intro: 400, name: 100, phone: 40, email: 120, note: 300, perUser: 500 } as const
export const SLOT_CHOICES = [30, 45, 60, 90, 120] as const

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,39}$/, 'Use 3 to 40 letters, numbers or dashes.')

export const bookingPageSchema = z.object({
  slug,
  enabled: z.boolean(),
  title: z.string().trim().max(BOOKING_LIMITS.title),
  intro: z.string().trim().max(BOOKING_LIMITS.intro),
  slotMinutes: z.number().int().min(15).max(240),
  daysAhead: z.number().int().min(1).max(60),
  minNoticeHours: z.number().int().min(0).max(168),
  hours: bookingHoursSchema,
  timeZone: z.string().min(1).max(60),
})
export type BookingPage = z.infer<typeof bookingPageSchema>

/** What a customer sees when they open the owner's booking link. */
export interface PublicBookingPage {
  title: string
  intro: string
  slotMinutes: number
  timeZone: string
  /** Days that still have a free slot, each with the start times (ISO) that can be booked. */
  days: { date: string; slots: string[] }[]
}

export const bookingRequestSchema = z.object({
  start: z.iso.datetime(),
  name: z.string().trim().min(1).max(BOOKING_LIMITS.name),
  phone: z.string().trim().max(BOOKING_LIMITS.phone).default(''),
  email: z.string().trim().max(BOOKING_LIMITS.email).default(''),
  note: z.string().trim().max(BOOKING_LIMITS.note).default(''),
  /** A box real people never see: robots fill it in. */
  website: z.string().max(200).default(''),
})
export type BookingRequest = z.infer<typeof bookingRequestSchema>

export interface Booking {
  id: string
  startsAt: string
  endsAt: string
  customerName: string
  customerPhone: string
  customerEmail: string
  note: string
  status: 'CONFIRMED' | 'CANCELLED'
  remindedAt: string | null
}

export const bookingPatchSchema = z.object({ status: z.literal('CANCELLED').optional(), reminded: z.literal(true).optional() })
export type BookingPatch = z.infer<typeof bookingPatchSchema>

/** The booking address for a page, on whatever site the app is running on. */
export const bookingPath = (slugValue: string): string => `/book/${slugValue}`
