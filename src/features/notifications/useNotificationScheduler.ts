import { useEffect } from 'react'
import { listAgenda } from '../../lib/agenda-api'
import { fetchBriefing } from '../../lib/plan-api'
import { usePlan } from '../../providers/usePlan'
import { listenForTaps, permissionState, schedule, type PlannedNotification } from './notify'
import { RESCHEDULE_EVENT, leadPhrase, readPrefs } from './prefs'

const HORIZON_MS = 7 * 24 * 60 * 60_000
const REFRESH_MS = 15 * 60_000
/** The next time the clock reads this HH:MM, today if it has not passed yet, otherwise tomorrow. */
function nextAt(time: string, now = new Date()): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const at = new Date(now)
  at.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  if (at <= now) at.setDate(at.getDate() + 1)
  return at
}

/**
 * Keeps the phone's reminders in step with the agenda: "time to send" at a draft's send-at time, a heads-up before
 * meetings, a daily briefing (Pro) and a nudge about unanswered quotes (Basic and up). It rebuilds the whole schedule
 * when the app opens or comes back to the front, every 15 minutes, and whenever a send time or a setting changes.
 */
export function useNotificationScheduler(signedIn: boolean): void {
  const { limits, state } = usePlan()
  const ready = signedIn && state !== null
  const { sendAtReminders, morningBriefing, followUps } = limits

  useEffect(() => {
    if (!ready) return
    let cancelled = false

    const rebuild = async () => {
      if ((await permissionState()) !== 'granted') return
      const prefs = readPrefs()
      const now = new Date()
      const planned: PlannedNotification[] = []

      const agenda = await listAgenda(now, new Date(now.getTime() + HORIZON_MS))
      for (const item of agenda.items) {
        const startsAt = new Date(item.startsAt)
        const remindAt = new Date(startsAt.getTime() - prefs.leadMinutes * 60_000)
        if (remindAt <= now) continue
        if (item.source === 'draft') {
          if (prefs.sendAt && sendAtReminders) {
            const title = prefs.leadMinutes === 0 ? 'Time to send' : `Send in ${leadPhrase(prefs.leadMinutes)}`
            planned.push({ key: `send-${item.id}-${item.startsAt}`, title, body: item.title, at: remindAt, tab: 'history' })
          }
        } else if (prefs.meetings && !item.allDay) {
          const title = prefs.leadMinutes === 0 ? 'Reminder' : `Reminder: in ${leadPhrase(prefs.leadMinutes)}`
          const body = item.notes ? `${item.title}. ${item.notes}` : item.title
          planned.push({ key: `meeting-${item.id}-${item.startsAt}`, title, body, at: remindAt, tab: 'agenda' })
        }
      }

      if (prefs.briefing && morningBriefing) {
        planned.push({ key: 'briefing', title: 'Your Volita briefing', body: 'Tap to see your day.', at: nextAt(prefs.time, now), tab: 'assistant', daily: true })
      }
      if (prefs.followUps && followUps) {
        const waiting = (await fetchBriefing(Intl.DateTimeFormat().resolvedOptions().timeZone)).followUps?.length ?? 0
        if (waiting > 0) {
          planned.push({
            key: 'follow-ups',
            title: 'Quotes waiting for an answer',
            body: `${waiting} ${waiting === 1 ? 'quote has' : 'quotes have'} had no reply. Tap for a nudge.`,
            at: nextAt(prefs.time, now),
            tab: 'assistant',
          })
        }
      }
      if (!cancelled) await schedule(planned)
    }

    const run = () => void rebuild().catch(() => undefined)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    run()
    const timer = window.setInterval(run, REFRESH_MS)
    window.addEventListener(RESCHEDULE_EVENT, run)
    document.addEventListener('visibilitychange', onVisible)
    let stopTaps: (() => void) | undefined
    void listenForTaps().then((stop) => {
      if (cancelled) stop()
      else stopTaps = stop
    })

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener(RESCHEDULE_EVENT, run)
      document.removeEventListener('visibilitychange', onVisible)
      stopTaps?.()
    }
  }, [ready, sendAtReminders, morningBriefing, followUps])
}
