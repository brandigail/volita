import { Copy, ExternalLink, Loader2, MessageCircle, Share2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { fetchBookingPage, fetchBookings, patchBooking, saveBookingPage } from '../../lib/booking-api'
import { authClient } from '../../lib/auth-client'
import { bookingReminderMessage } from '../../lib/business-messages'
import { whatsAppLink } from '../../lib/invoice-text'
import { profileFromUser } from '../../lib/profile'
import { useNow } from '../../lib/useNow'
import { bookingPath, type Booking, type BookingPage } from '../../types/booking'
import { BookingSettings } from './BookingSettings'

const DAY_BEFORE_MS = 36 * 3_600_000

const when = (iso: string, zone: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone }).format(new Date(iso))

/** The booking link: switch it on, share it, set the hours, and see who has booked, with the day-before reminder ready to send. */
export function BookingsPanel() {
  const { data: session } = authClient.useSession()
  const [page, setPage] = useState<BookingPage | null>(null)
  const [saved, setSaved] = useState(false)
  /** Open the first time (nothing saved yet), then only as the person opens and closes it. */
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const profile = session ? profileFromUser(session.user) : null
  const now = useNow()

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchBookingPage(), fetchBookings()])
      .then(([loaded, list]) => {
        if (cancelled) return
        setPage(loaded.page)
        setSaved(loaded.saved)
        setSettingsOpen(!loaded.saved)
        setBookings(list)
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not load your bookings.'))
    return () => {
      cancelled = true
    }
  }, [])

  const link = page ? `${window.location.origin}${bookingPath(page.slug)}` : ''
  const replace = useCallback((updated: Booking) => setBookings((current) => (current ?? []).map((item) => (item.id === updated.id ? updated : item))), [])

  const toggle = async () => {
    if (!page) return
    setBusy(true)
    setError(null)
    try {
      setPage(await saveBookingPage({ ...page, enabled: !page.enabled }))
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change that. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setNote('Link copied. Paste it into WhatsApp, your Facebook page or your email signature.')
    } catch {
      setNote(`Press and hold to copy: ${link}`)
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: page?.title || 'Book a time', url: link })
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  }
  const act = async (id: string, patch: { status?: 'CANCELLED'; reminded?: true }) => {
    try {
      replace(await patchBooking(id, patch))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change that. Please try again.')
    }
  }

  const upcoming = (bookings ?? []).filter((item) => item.status === 'CONFIRMED' && new Date(item.endsAt).getTime() > now)

  return (
    <div className="flex flex-col gap-4">
      {!page && !error && (
        <p role="status" className="muted flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {page && (
        <section className="surface flex flex-col gap-3 p-5" aria-label="Your booking link">
          <h2 className="text-xl font-extrabold">Your booking link</h2>
          <p className="muted text-sm">Customers pick a free time on their own phone, and it lands on your agenda. No sign-up for them.</p>
          {saved && <p className="field text-sm break-all select-all">{link}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void toggle()} disabled={busy || !saved} className={page.enabled ? 'btn btn-ghost' : 'btn btn-primary'}>
              {page.enabled ? 'Switch the link off' : 'Switch the link on'}
            </button>
            {saved && page.enabled && (
              <>
                <button type="button" onClick={() => void copy()} className="btn btn-ghost">
                  <Copy className="size-4" aria-hidden="true" />
                  Copy
                </button>
                {typeof navigator.share === 'function' && (
                  <button type="button" onClick={() => void share()} className="btn btn-ghost">
                    <Share2 className="size-4" aria-hidden="true" />
                    Share
                  </button>
                )}
                <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  See it
                </a>
              </>
            )}
          </div>
          {!saved && <p className="text-sm">Check the hours below and save them first, then switch the link on.</p>}
          {saved && !page.enabled && <p className="muted text-sm">The link is off, so customers see “not available”.</p>}
          {note && (
            <p role="status" className="text-sm">
              {note}
            </p>
          )}
          <details open={settingsOpen} onToggle={(event) => setSettingsOpen(event.currentTarget.open)} className="mt-1">
            <summary className="cursor-pointer text-sm font-semibold">Hours and settings</summary>
            <div className="mt-3">
              <BookingSettings
                page={page}
                onSaved={(next) => {
                  setPage(next)
                  setSaved(true)
                }}
              />
            </div>
          </details>
        </section>
      )}

      {bookings && (
        <section aria-label="Upcoming bookings" className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">Booked</h2>
          {upcoming.length === 0 && <p className="muted text-sm">Nobody has booked yet. Share your link and they appear here and on your agenda.</p>}
          {upcoming.map((item) => {
            const soon = new Date(item.startsAt).getTime() - now < DAY_BEFORE_MS
            const reminder = profile && page ? bookingReminderMessage(item, profile, page.timeZone) : null
            return (
              <article key={item.id} className="surface flex flex-col gap-2 p-4">
                <p className="font-semibold">
                  {item.customerName} <span className="muted font-normal">· {page ? when(item.startsAt, page.timeZone) : when(item.startsAt, 'Africa/Johannesburg')}</span>
                </p>
                <p className="muted text-sm">{[item.customerPhone, item.customerEmail, item.note].filter(Boolean).join(' · ')}</p>
                <div className="flex flex-wrap gap-2">
                  {soon && !item.remindedAt && reminder && item.customerPhone && (
                    <a href={whatsAppLink(item.customerPhone, reminder.body)} target="_blank" rel="noopener noreferrer" onClick={() => void act(item.id, { reminded: true })} className="btn btn-channel">
                      <MessageCircle className="size-4" aria-hidden="true" />
                      Send the reminder
                    </a>
                  )}
                  {item.remindedAt && <span className="muted self-center text-sm">Reminder sent</span>}
                  <button type="button" onClick={() => void act(item.id, { status: 'CANCELLED' })} className="btn btn-ghost">
                    Cancel booking
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}
