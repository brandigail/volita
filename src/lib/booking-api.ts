import { z } from 'zod'
import { bookingPageSchema, type Booking, type BookingPage, type PublicBookingPage } from '../types/booking'
import { ApiRequestError, request } from './api'

const bookingSchema = z.object({
  id: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerEmail: z.string(),
  note: z.string(),
  status: z.enum(['CONFIRMED', 'CANCELLED']),
  remindedAt: z.string().nullable(),
})

const publicSchema = z.object({
  title: z.string(),
  intro: z.string(),
  slotMinutes: z.number(),
  timeZone: z.string(),
  days: z.array(z.object({ date: z.string(), slots: z.array(z.string()) })),
})

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
  return result.data
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** What a customer sees: the free times on the owner's page. No sign-in. */
export async function fetchPublicBooking(slug: string): Promise<PublicBookingPage> {
  return parse(publicSchema, await request(`/api/book/${encodeURIComponent(slug)}`, { method: 'GET' }))
}

export interface BookingDetails {
  start: string
  name: string
  phone: string
  email: string
  note: string
}

export interface BookedSlot {
  startsAt: string
  endsAt: string
  title: string
}

export async function bookSlot(slug: string, details: BookingDetails, website: string): Promise<BookedSlot> {
  const result = parse(z.object({ booked: z.literal(true), startsAt: z.string(), endsAt: z.string(), title: z.string() }), await request(`/api/book/${encodeURIComponent(slug)}`, jsonInit('POST', { ...details, website })))
  return { startsAt: result.startsAt, endsAt: result.endsAt, title: result.title }
}

export async function fetchBookingPage(): Promise<{ page: BookingPage; saved: boolean }> {
  const query = `tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`
  return parse(z.object({ page: bookingPageSchema, saved: z.boolean() }), await request(`/api/booking-page?${query}`, { method: 'GET' }))
}

export async function saveBookingPage(page: BookingPage): Promise<BookingPage> {
  return parse(bookingPageSchema, await request('/api/booking-page', jsonInit('PUT', page)))
}

export async function fetchBookings(): Promise<Booking[]> {
  return parse(z.object({ bookings: z.array(bookingSchema) }), await request('/api/bookings', { method: 'GET' })).bookings
}

export async function patchBooking(id: string, patch: { status?: 'CANCELLED'; reminded?: true }): Promise<Booking> {
  return parse(bookingSchema, await request(`/api/bookings/${id}`, jsonInit('PATCH', patch)))
}
