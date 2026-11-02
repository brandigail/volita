import { Bell, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePlan } from '../../providers/usePlan'
import { isNativeApp, permissionState, requestPermission, showNow, type PermissionState } from './notify'
import { LEAD_OPTIONS, readPrefs, writePrefs, type NotificationPrefs } from './prefs'

interface ToggleProps {
  id: string
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function Toggle({ id, label, hint, checked, disabled, onChange }: ToggleProps) {
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 cursor-pointer accent-violet-500" />
      <label htmlFor={id} className="flex-1 cursor-pointer text-sm">
        <span className="font-semibold">{label}</span>
        <span className="muted block text-xs">{hint}</span>
      </label>
    </div>
  )
}

const STATE_TEXT: Record<PermissionState, string> = {
  granted: 'Notifications are on.',
  denied: 'Notifications are blocked. Turn them on for Apex Voice in your phone or browser settings.',
  prompt: 'Notifications are off. Turn them on to get reminders.',
  unsupported: 'This browser cannot show notifications.',
}

/** Which pop-ups to get, and a button to prove they work. Settings are per device because each device schedules its own. */
export function NotificationSettings() {
  const { limits } = usePlan()
  const [prefs, setPrefs] = useState<NotificationPrefs>(readPrefs)
  const [permission, setPermission] = useState<PermissionState>('prompt')
  const [testNote, setTestNote] = useState<string | null>(null)

  useEffect(() => {
    void permissionState().then(setPermission)
  }, [])

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    writePrefs(next)
  }

  const turnOn = async () => setPermission(await requestPermission())

  const test = async () => {
    setTestNote(null)
    if (permission !== 'granted') {
      const result = await requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        setTestNote(STATE_TEXT[result])
        return
      }
    }
    await showNow('Apex Voice', 'This is a test notification. Reminders will look like this.')
    setTestNote('Sent. It should pop up in a second or two.')
  }

  return (
    <section aria-labelledby="notifications-heading" className="mt-10" data-tour="notifications">
      <h2 id="notifications-heading" className="text-2xl font-extrabold tracking-tight">
        Notifications
      </h2>
      <div className="surface mt-4 flex flex-col gap-4 p-5">
        <p role="status" className="flex items-center gap-2 text-sm font-semibold">
          {permission === 'granted' ? <BellRing className="size-4 text-emerald-400" aria-hidden="true" /> : <Bell className="size-4 text-amber-400" aria-hidden="true" />}
          {STATE_TEXT[permission]}
        </p>
        <div className="flex flex-wrap gap-2">
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button type="button" onClick={() => void turnOn()} className="btn btn-primary">
              Turn on notifications
            </button>
          )}
          <button type="button" onClick={() => void test()} className="btn btn-ghost">
            Send a test notification
          </button>
        </div>
        {testNote && (
          <p role="status" className="muted text-sm">
            {testNote}
          </p>
        )}

        <Toggle id="notify-send" label="Time to send" hint={limits.sendAtReminders ? 'At the time you set on a draft.' : 'Part of the Basic plan.'} checked={prefs.sendAt && limits.sendAtReminders} disabled={!limits.sendAtReminders} onChange={(sendAt) => update({ sendAt })} />
        <Toggle id="notify-meetings" label="Meetings" hint="Before something on your agenda, at the lead time below." checked={prefs.meetings} onChange={(meetings) => update({ meetings })} />
        <Toggle id="notify-briefing" label="Morning briefing" hint={limits.morningBriefing ? 'Once a day at the time below.' : 'Part of the Pro plan.'} checked={prefs.briefing && limits.morningBriefing} disabled={!limits.morningBriefing} onChange={(briefing) => update({ briefing })} />
        <Toggle id="notify-followups" label="Quotes waiting for an answer" hint={limits.followUps ? 'A daily nudge when a quote has had no reply for three days.' : 'Part of the Basic plan.'} checked={prefs.followUps && limits.followUps} disabled={!limits.followUps} onChange={(followUps) => update({ followUps })} />

        <div>
          <label htmlFor="notify-lead" className="mb-1.5 block text-sm font-semibold">
            Tell me
          </label>
          <select id="notify-lead" value={prefs.leadMinutes} onChange={(e) => update({ leadMinutes: Number(e.target.value) })} className="field w-auto cursor-pointer">
            {LEAD_OPTIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="muted mt-1 text-xs">Applies to meetings and to the time to send a draft.</p>
        </div>

        {(limits.morningBriefing || limits.followUps) && (
          <div>
            <label htmlFor="notify-time" className="mb-1.5 block text-sm font-semibold">
              Daily time
            </label>
            <input id="notify-time" type="time" value={prefs.time} onChange={(e) => e.target.value && update({ time: e.target.value })} className="field w-auto" />
            <p className="muted mt-1 text-xs">Any minute you like, for example 08:03. Used for the briefing and the quote nudge.</p>
          </div>
        )}

        <p className="muted text-xs">
          {isNativeApp
            ? 'On this phone the system delivers reminders even when Apex is closed. If they arrive late, set battery use for Apex Voice to "Unrestricted" in the phone settings.'
            : 'In a browser, reminders appear while Apex is open or installed. For reminders with the app closed, use the Android app.'}
        </p>
      </div>
    </section>
  )
}
