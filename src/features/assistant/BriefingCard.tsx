import { Check, Loader2, MessageCircle, Sunrise, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiRequestError, generateDraft } from '../../lib/api'
import { saveDraft, updateDraftStatus } from '../../lib/drafts-api'
import { fetchBriefing } from '../../lib/plan-api'
import { usePlan } from '../../providers/usePlan'
import type { Briefing, FollowUp } from '../../types/plan-state'

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

function FollowUpRow({ item, onDone }: { item: FollowUp; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState<'write' | 'done' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const who = item.recipient || item.subject || 'a customer'

  /** Writes a short WhatsApp nudge and saves it to History, ready to review and send. */
  const write = async () => {
    setBusy('write')
    setNote(null)
    try {
      const draft = await generateDraft(
        `Follow up politely with ${who} about the quote I sent ${item.daysAgo} days ago${item.subject ? ` (${item.subject})` : ''}. Ask if they have any questions and whether they would like to go ahead.`,
        'WHATSAPP',
        'same',
        'en',
      )
      const now = new Date().toISOString()
      await saveDraft({ id: crypto.randomUUID(), ...draft, recipient: item.recipient || draft.recipient, transcript: `Follow-up on quote to ${who}`, createdAt: now, updatedAt: now })
      setNote('Saved to History, ready to send.')
    } catch (err) {
      setNote(err instanceof ApiRequestError ? err.message : 'Could not write that.')
    } finally {
      setBusy(null)
    }
  }

  const done = async () => {
    setBusy('done')
    try {
      await updateDraftStatus(item.id, { followUpDone: true })
      onDone(item.id)
    } catch {
      setBusy(null)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-0 flex-1">
        Quote to <span className="font-semibold">{who}</span> <span className="muted">· {item.daysAgo} days, no answer</span>
        {note && <span className="muted block text-xs">{note}</span>}
      </span>
      <button type="button" disabled={busy !== null} onClick={() => void write()} className="btn btn-ghost px-3 py-1 text-xs">
        {busy === 'write' ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <MessageCircle className="size-3" aria-hidden="true" />}
        Write a nudge
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void done()} className="btn btn-ghost px-3 py-1 text-xs">
        <Check className="size-3" aria-hidden="true" />
        Done
      </button>
    </li>
  )
}

/** Today at a glance: the morning briefing on Pro, and quotes nobody has answered on Basic and up. */
export function BriefingCard() {
  const { limits } = usePlan()
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const enabled = limits.morningBriefing || limits.followUps

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchBriefing(Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then((loaded) => !cancelled && setBriefing(loaded))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled])

  if (!enabled || !briefing) return null

  const speak = () => {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(briefing.summary))
  }
  const dropFollowUp = (id: string) => setBriefing((current) => current && { ...current, followUps: current.followUps?.filter((f) => f.id !== id) ?? null })

  return (
    <section aria-labelledby="briefing-heading" className="surface w-full p-5 text-left" data-tour="briefing">
      <div className="flex items-center justify-between gap-2">
        <h2 id="briefing-heading" className="flex items-center gap-2 text-lg font-bold">
          <Sunrise className="size-5 text-amber-400" aria-hidden="true" />
          {limits.morningBriefing ? 'Your briefing' : 'Waiting for an answer'}
        </h2>
        <button type="button" onClick={speak} className="btn btn-ghost px-3 py-1 text-xs">
          <Volume2 className="size-3" aria-hidden="true" />
          Read it to me
        </button>
      </div>
      <p className="mt-2 text-sm">{briefing.summary}</p>
      {briefing.meetings && briefing.meetings.length > 0 && (
        <ul className="muted mt-3 space-y-1 text-sm">
          {briefing.meetings.slice(0, 6).map((meeting) => (
            <li key={`${meeting.startsAt}-${meeting.title}`}>
              {meeting.allDay ? 'All day' : clock.format(new Date(meeting.startsAt))} · {meeting.title}
            </li>
          ))}
        </ul>
      )}
      {briefing.overdue && briefing.overdue.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-red-600 dark:text-red-400">
          {briefing.overdue.map((item) => (
            <li key={item.id}>Due: {item.title}</li>
          ))}
        </ul>
      )}
      {briefing.followUps && briefing.followUps.length > 0 && (
        <ul className="mt-3 space-y-2">
          {briefing.followUps.map((item) => (
            <FollowUpRow key={item.id} item={item} onDone={dropFollowUp} />
          ))}
        </ul>
      )}
    </section>
  )
}
