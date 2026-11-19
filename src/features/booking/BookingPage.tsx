import { CalendarPlus, CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { SITE } from '../../config/site'
import { ApiRequestError } from '../../lib/api'
import { bookSlot, fetchPublicBooking, type BookedSlot } from '../../lib/booking-api'
import { buildIcs } from '../../lib/ics'
import { BOOKING_LIMITS, type PublicBookingPage } from '../../types/booking'

const chipLabel = (isoDate: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${isoDate}T12:00:00Z`))
const timeLabel = (iso: string, zone: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(new Date(iso))
const whenLabel = (iso: string, zone: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: zone }).format(new Date(iso))

/** Gives the customer's phone a calendar file for the booking, so it is in their diary. */
function downloadCalendar(booked: BookedSlot): void {
  const file = new Blob([buildIcs({ title: booked.title || 'Booking', startsAt: booked.startsAt, endsAt: booked.endsAt, uid: booked.startsAt })], { type: 'text/calendar' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = 'booking.ics'
  link.click()
  URL.revokeObjectURL(url)
}

/** The page a customer opens from a business's booking link. No account and no sign-in: pick a time, say who you are, done. */
export function BookingPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<PublicBookingPage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [start, setStart] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [trap, setTrap] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<BookedSlot | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicBooking(slug)
      .then((loaded) => {
        if (cancelled) return
        setPage(loaded)
        setDay(loaded.days[0]?.date ?? null)
      })
      .catch((err: unknown) => !cancelled && setLoadError(err instanceof ApiRequestError ? err.message : 'Could not open this booking page.'))
    return () => {
      cancelled = true
    }
  }, [slug])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!start || !page) return
    setBusy(true)
    setError(null)
    try {
      setBooked(await bookSlot(slug, { start, name, phone, email, note }, trap))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not book that. Please try again.')
      // Someone else may have taken it a moment ago: show the times that are left.
      fetchPublicBooking(slug)
        .then((fresh) => {
          setPage(fresh)
          if (err instanceof ApiRequestError && err.status === 409) setStart(null)
        })
        .catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  const slots = page?.days.find((candidate) => candidate.date === day)?.slots ?? []

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-8">
      {loadError && (
        <p role="alert" className="surface p-5">
          {loadError}
        </p>
      )}
      {!page && !loadError && (
        <p role="status" className="muted flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      )}

      {page && booked && (
        <section className="surface flex flex-col gap-3 p-6" aria-live="polite">
          <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">You are booked</h1>
          <p>
            {page.title ? `${page.title} will see you ` : 'See you '}
            <strong>{whenLabel(booked.startsAt, page.timeZone)}</strong>.
          </p>
          <button type="button" onClick={() => downloadCalendar(booked)} className="btn btn-ghost self-start">
            <CalendarPlus className="size-4" aria-hidden="true" />
            Add to my calendar
          </button>
        </section>
      )}

      {page && !booked && (
        <>
          <header>
            <h1 className="text-3xl font-extrabold tracking-tight">{page.title || 'Book a time'}</h1>
            {page.intro && <p className="muted mt-2">{page.intro}</p>}
            <p className="muted mt-1 text-sm">Each visit is about {page.slotMinutes} minutes. Times are shown in {page.timeZone.replace('_', ' ')} time.</p>
          </header>

          {page.days.length === 0 ? (
            <p className="surface p-5">There are no free times at the moment. Please check again soon, or contact them directly.</p>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
              {/* min-w-0: a fieldset will not shrink below its contents by default, and the long row of days would stretch the whole page. */}
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-semibold">Pick a day</legend>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {page.days.map((candidate) => (
                    <button
                      key={candidate.date}
                      type="button"
                      onClick={() => {
                        setDay(candidate.date)
                        setStart(null)
                      }}
                      aria-pressed={candidate.date === day}
                      className={`btn shrink-0 ${candidate.date === day ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      {chipLabel(candidate.date)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Pick a time</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button key={slot} type="button" onClick={() => setStart(slot)} aria-pressed={slot === start} className={`btn ${slot === start ? 'btn-primary' : 'btn-ghost'}`}>
                      {timeLabel(slot, page.timeZone)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {start && (
                <div className="surface flex flex-col gap-4 p-5">
                  <p className="font-semibold">{whenLabel(start, page.timeZone)}</p>
                  <div>
                    <label htmlFor="book-name" className="mb-1.5 block text-sm font-semibold">
                      Your name
                    </label>
                    <input id="book-name" className="field" required value={name} maxLength={BOOKING_LIMITS.name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="book-phone" className="mb-1.5 block text-sm font-semibold">
                        Phone or WhatsApp
                      </label>
                      <input id="book-phone" className="field" type="tel" value={phone} maxLength={BOOKING_LIMITS.phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                    </div>
                    <div>
                      <label htmlFor="book-email" className="mb-1.5 block text-sm font-semibold">
                        Email <span className="muted font-normal">(optional)</span>
                      </label>
                      <input id="book-email" className="field" type="email" value={email} maxLength={BOOKING_LIMITS.email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="book-note" className="mb-1.5 block text-sm font-semibold">
                      What is it about? <span className="muted font-normal">(optional)</span>
                    </label>
                    <textarea id="book-note" className="field min-h-20" value={note} maxLength={BOOKING_LIMITS.note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  {/* People never see this box. A robot that fills in every field fills this too, and is refused. */}
                  <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label>
                      Website
                      <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
                    </label>
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                      {error}
                    </p>
                  )}
                  <button type="submit" disabled={busy} className="btn btn-primary">
                    {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    Book this time
                  </button>
                </div>
              )}
              {!start && error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
              )}
            </form>
          )}
        </>
      )}
      <p className="muted mt-auto text-center text-xs">Booking by {SITE.name}</p>
    </main>
  )
}
