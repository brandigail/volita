import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiRequestError } from '../../lib/api'
import { saveBookingPage } from '../../lib/booking-api'
import { BOOKING_LIMITS, SLOT_CHOICES, WEEKDAYS, WEEKDAY_NAMES, type BookingPage, type Weekday } from '../../types/booking'

interface BookingSettingsProps {
  page: BookingPage
  onSaved: (page: BookingPage) => void
}

const DEFAULT_DAY = { start: '08:00', end: '17:00' }

/** How the booking link works: the address, which days and hours, how long a visit is, and how far ahead people can book. */
export function BookingSettings({ page, onSaved }: BookingSettingsProps) {
  const [form, setForm] = useState(page)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = <K extends keyof BookingPage>(key: K, value: BookingPage[K]) => {
    setSaved(false)
    setForm((current) => ({ ...current, [key]: value }))
  }
  const setDay = (day: Weekday, window: { start: string; end: string } | null) => {
    const others = Object.fromEntries(Object.entries(form.hours).filter(([key]) => key !== day))
    set('hours', window ? { ...others, [day]: window } : others)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveBookingPage(form))
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="bk-title" className="mb-1.5 block text-sm font-semibold">
          Name shown to customers
        </label>
        <input id="bk-title" className="field" value={form.title} maxLength={BOOKING_LIMITS.title} onChange={(e) => set('title', e.target.value)} />
      </div>
      <div>
        <label htmlFor="bk-intro" className="mb-1.5 block text-sm font-semibold">
          A line about what you do <span className="muted font-normal">(optional)</span>
        </label>
        <textarea id="bk-intro" className="field min-h-20" value={form.intro} maxLength={BOOKING_LIMITS.intro} onChange={(e) => set('intro', e.target.value)} />
      </div>
      <div>
        <label htmlFor="bk-slug" className="mb-1.5 block text-sm font-semibold">
          Your booking address
        </label>
        <div className="flex items-center gap-1">
          <span className="muted text-sm">/book/</span>
          <input id="bk-slug" className="field" value={form.slug} maxLength={40} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="bk-length" className="mb-1.5 block text-sm font-semibold">
            Visit length
          </label>
          <select id="bk-length" className="field" value={form.slotMinutes} onChange={(e) => set('slotMinutes', Number(e.target.value))}>
            {SLOT_CHOICES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bk-ahead" className="mb-1.5 block text-sm font-semibold">
            Days ahead
          </label>
          <input id="bk-ahead" type="number" min={1} max={60} className="field" value={form.daysAhead} onChange={(e) => set('daysAhead', Math.max(1, Math.min(60, Math.round(Number(e.target.value) || 1))))} />
        </div>
        <div>
          <label htmlFor="bk-notice" className="mb-1.5 block text-sm font-semibold">
            Notice (hours)
          </label>
          <input id="bk-notice" type="number" min={0} max={168} className="field" value={form.minNoticeHours} onChange={(e) => set('minNoticeHours', Math.max(0, Math.min(168, Math.round(Number(e.target.value) || 0))))} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Days and hours you take bookings</legend>
        {WEEKDAYS.map((day) => {
          const window = form.hours[day]
          return (
            <div key={day} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold sm:w-32">
                <input type="checkbox" className="size-5 accent-orange-600" checked={window !== undefined} onChange={(e) => setDay(day, e.target.checked ? DEFAULT_DAY : null)} />
                {WEEKDAY_NAMES[day]}
              </label>
              {window && (
                <div className="flex items-center gap-2 pl-7 sm:pl-0">
                  <input aria-label={`${WEEKDAY_NAMES[day]} from`} type="time" className="field w-32" value={window.start} onChange={(e) => setDay(day, { ...window, start: e.target.value })} />
                  <span className="muted text-sm">to</span>
                  <input aria-label={`${WEEKDAY_NAMES[day]} until`} type="time" className="field w-32" value={window.end} onChange={(e) => setDay(day, { ...window, end: e.target.value })} />
                </div>
              )}
            </div>
          )
        })}
        <p className="muted text-xs">Meetings already on your Volita agenda and earlier bookings are never offered, so nobody can double-book you.</p>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save booking settings
        </button>
        {saved && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
            Saved
          </p>
        )}
      </div>
    </form>
  )
}
