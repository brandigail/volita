import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { z } from 'zod'
import { CalendarCheck, CheckCircle2, ClipboardPaste, ExternalLink, Link2Off, X } from 'lucide-react'
import { UpgradeNote } from '../../components/UpgradeNote'
import { ApiRequestError, request } from '../../lib/api'
import { addCalendar, fetchCalendars, removeCalendar, type CalendarsInfo } from '../../lib/plan-api'
import type { CalendarCheckResponse } from '../../types/agenda'

type ProviderId = 'google' | 'outlook' | 'apple' | 'other'

interface Provider {
  id: ProviderId
  name: string
  /** Opens the page where this provider shows the private address. */
  openLabel?: string
  openUrl?: string
  steps: readonly string[]
  accent: string
}

const PROVIDERS: readonly Provider[] = [
  {
    id: 'google',
    name: 'Google Calendar',
    openLabel: 'Open Google Calendar settings',
    openUrl: 'https://calendar.google.com/calendar/u/0/r/settings',
    steps: [
      'Use a computer if you can. The Google Calendar app and phone site do not show this setting. On a phone, open the link in Chrome, tap the three dots and choose "Desktop site".',
      'Tap the button below. It opens the settings for your own calendar (sign in to Google if asked).',
      'Scroll down to "Integrate calendar" and copy the "Secret address in iCal format". It is a long link ending in basic.ics.',
      'Come back here and tap "Paste the link and test it".',
    ],
    accent: '#4285f4',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    openLabel: 'Open Outlook calendar sharing',
    openUrl: 'https://outlook.live.com/calendar/0/options/calendar/SharedCalendars',
    steps: [
      'Under "Publish a calendar", pick your calendar.',
      'Choose "Can view all details" and tap Publish.',
      'Copy the ICS link that appears. (Work accounts may need your IT admin to allow this.)',
    ],
    accent: '#0a64ad',
  },
  {
    id: 'apple',
    name: 'Apple (iCloud)',
    openLabel: 'Open iCloud Calendar',
    openUrl: 'https://www.icloud.com/calendar/',
    steps: [
      'On your iPhone: Calendar, then Calendars, then the (i) next to your calendar.',
      'Turn on "Public Calendar" and tap "Share Link".',
      'Choose Copy.',
    ],
    accent: '#8e8e93',
  },
  {
    id: 'other',
    name: 'Something else',
    steps: ['Most calendar apps can publish a private address ending in .ics.', 'Copy that address.'],
    accent: '#8b5cf6',
  },
]

const checkSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  count: z.number(),
  next: z.array(z.object({ title: z.string(), startsAt: z.string(), allDay: z.boolean() })),
})

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Google can open the settings of one specific calendar when its id (the account email) is base64 encoded into the address. */
function googleSettingsUrl(email: string): string {
  const id = btoa(email.trim()).replace(/=+$/, '')
  return `https://calendar.google.com/calendar/u/0/r/settings/calendar/${id}`
}

interface CalendarConnectProps {
  /** The email the user signed up to Apex with; used as the starting guess for their Google account. */
  accountEmail: string
}

/** Guides someone through linking their calendar: pick the app, copy the address with a few taps, test it, done. */
export function CalendarConnect({ accountEmail }: CalendarConnectProps) {
  const [info, setInfo] = useState<CalendarsInfo | null>(null)
  const [googleEmail, setGoogleEmail] = useState(accountEmail)
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [provider, setProvider] = useState<Provider | null>(null)
  const [draft, setDraft] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<CalendarCheckResponse | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchCalendars()
      .then((loaded) => !cancelled && setInfo(loaded))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const open = () => {
    setProvider(null)
    setDraft('')
    setResult(null)
    setProblem(null)
    dialogRef.current?.showModal()
  }
  const close = () => dialogRef.current?.close()

  useEffect(() => {
    const dialog = dialogRef.current
    const closeOnBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) dialog?.close()
    }
    dialog?.addEventListener('click', closeOnBackdrop)
    return () => dialog?.removeEventListener('click', closeOnBackdrop)
  }, [])

  const check = async (address: string) => {
    setChecking(true)
    setProblem(null)
    setResult(null)
    try {
      const body = checkSchema.safeParse(await request('/api/calendar-check', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: address }) }))
      if (!body.success) throw new ApiRequestError(502, 'The server sent an unexpected response.')
      if (body.data.ok) setResult(body.data)
      else setProblem(body.data.error ?? 'That link did not work.')
    } catch (err) {
      setProblem(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  /** One tap: read the copied address from the clipboard and test it straight away. */
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      setDraft(text)
      if (text) await check(text)
    } catch {
      setProblem('Your browser would not let me read the clipboard. Paste the link into the box instead.')
    }
  }

  const use = async () => {
    setSaving(true)
    try {
      setInfo(await addCalendar(draft.trim()))
      close()
    } catch (err) {
      setProblem(err instanceof ApiRequestError ? err.message : 'Could not save the link. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">
        Calendar <span className="muted font-normal">(optional)</span>
      </p>
      <div className="surface flex flex-col gap-3 p-4">
        {info && info.max === 0 ? (
          <UpgradeNote message="Linking a calendar is part of the Basic plan (Pro links up to three)." needs="basic" onSeePlans={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })} />
        ) : (
          <>
            {info && info.calendars.length > 0 ? (
              <ul className="space-y-2">
                {info.calendars.map((calendar, index) => (
                  <li key={`${calendar.host}-${index}`} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{calendar.host}</span>
                    <button type="button" onClick={() => void removeCalendar(index).then(setInfo).catch(() => undefined)} className="btn btn-ghost px-3 py-1 text-xs">
                      <Link2Off className="size-3" aria-hidden="true" />
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-sm">Link your calendar so the assistant knows your meetings.</p>
            )}
            {info && info.inactive > 0 && <p className="muted text-xs">{info.inactive} more linked calendar(s) are kept but switched off on your plan.</p>}
            {info && info.calendars.length < info.max && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={open} className="btn btn-primary">
                  <CalendarCheck className="size-4" aria-hidden="true" />
                  {info.calendars.length > 0 ? 'Add another calendar' : 'Connect calendar'}
                </button>
              </div>
            )}
            {info && info.max === 1 && info.calendars.length === 1 && <p className="muted text-xs">Pro links up to three calendars.</p>}
          </>
        )}
      </div>

      {createPortal(
      <dialog
        ref={dialogRef}
        aria-labelledby="calendar-dialog-title"
        className="m-auto w-[min(92vw,30rem)] rounded-3xl border border-(--line) bg-(--surface-strong) p-0 text-(--ink) shadow-2xl backdrop:bg-black/60"
      >
        <div className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="calendar-dialog-title" className="text-xl font-bold">
              {provider ? provider.name : 'Which calendar do you use?'}
            </h2>
            <button type="button" onClick={close} aria-label="Close" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-violet-500/15">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {!provider ? (
            <div className="grid grid-cols-2 gap-3">
              {PROVIDERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setProvider(option)}
                  className="surface flex flex-col items-start gap-2 p-4 text-left font-semibold hover:border-violet-400/70"
                >
                  <span className="size-3 rounded-full" style={{ background: option.accent }} aria-hidden="true" />
                  {option.name}
                </button>
              ))}
            </div>
          ) : (
            <>
              <ol className="muted list-decimal space-y-1.5 pl-5 text-sm">
                {provider.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              {provider.id === 'google' && (
                <div>
                  <label htmlFor="google-email" className="mb-1.5 block text-sm font-semibold">
                    Your Google account email
                  </label>
                  <input
                    id="google-email"
                    type="email"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    autoComplete="email"
                    className="field"
                  />
                </div>
              )}

              {provider.openUrl && (
                <a
                  href={provider.id === 'google' && googleEmail.includes('@') ? googleSettingsUrl(googleEmail) : provider.openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {provider.openLabel}
                </a>
              )}

              <button type="button" onClick={() => void paste()} disabled={checking} className="btn btn-primary">
                <ClipboardPaste className="size-4" aria-hidden="true" />
                {checking ? 'Checking…' : 'Paste the link and test it'}
              </button>

              <div>
                <label htmlFor="calendar-link" className="mb-1.5 block text-sm font-semibold">
                  Or paste it here
                </label>
                <div className="flex gap-2">
                  <input
                    id="calendar-link"
                    type="url"
                    inputMode="url"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value)
                      setResult(null)
                    }}
                    placeholder="https://… or webcal://…"
                    autoComplete="off"
                    className="field"
                  />
                  <button type="button" onClick={() => void check(draft.trim())} disabled={checking || draft.trim().length < 8} className="btn btn-ghost">
                    Test
                  </button>
                </div>
              </div>

              {problem && (
                <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
                  {problem}
                </p>
              )}

              {result && (
                <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                    It works. Found {result.count} {result.count === 1 ? 'event' : 'events'} in the next 30 days.
                  </p>
                  {result.next.length > 0 && (
                    <ul className="muted mt-1 space-y-0.5">
                      {result.next.map((event) => (
                        <li key={event.title + event.startsAt}>
                          {event.title} · {event.allDay ? 'all day' : dateFormat.format(new Date(event.startsAt))}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => void use()} disabled={saving} className="btn btn-primary mt-3 w-full">
                    {saving ? 'Saving…' : 'Use this calendar'}
                  </button>
                </div>
              )}

              <button type="button" onClick={() => setProvider(null)} className="muted self-start text-sm underline">
                Pick a different calendar
              </button>
            </>
          )}
        </div>
      </dialog>,
      document.body,
      )}
    </div>
  )
}
