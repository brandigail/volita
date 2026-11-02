import { Bell, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePlan } from '../../providers/usePlan'
import type { AgendaItem } from '../../types/agenda'
import { permissionState, requestPermission, type PermissionState } from '../notifications/notify'
import { requestReschedule } from '../notifications/prefs'
import { tomorrowText } from './tomorrow'

/** A one-tap WhatsApp message with tomorrow's meetings and sends, to yourself or to whoever helps you. */
export function TomorrowOnWhatsApp({ items }: { items: readonly AgendaItem[] }) {
  const { limits } = usePlan()
  if (!limits.sendAtReminders) return null
  const { text, count } = tomorrowText(items)
  return (
    <a
      href={count > 0 ? `https://wa.me/?text=${encodeURIComponent(text)}` : undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={count === 0}
      className={`btn btn-ghost mt-4 ${count === 0 ? 'pointer-events-none opacity-50' : ''}`}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      {count > 0 ? `Send tomorrow's ${count} ${count === 1 ? 'item' : 'items'} on WhatsApp` : 'Nothing planned for tomorrow'}
    </a>
  )
}

/** Offers to turn on pop-up reminders, once, at the moment the person is looking at their agenda. */
export function EnableReminders() {
  const [state, setState] = useState<PermissionState>('granted')
  useEffect(() => {
    void permissionState().then(setState)
  }, [])
  if (state !== 'prompt') return null

  const turnOn = async () => {
    setState(await requestPermission())
    requestReschedule()
  }

  return (
    <button type="button" onClick={() => void turnOn()} className="surface mt-5 flex w-full items-center gap-3 p-4 text-left hover:border-brand-400/60">
      <Bell className="size-5 shrink-0 text-amber-400" aria-hidden="true" />
      <span className="text-sm">
        <span className="font-semibold">Get pop-up reminders</span>
        <span className="muted block">Volita can nudge you when it is time to send something and before meetings.</span>
      </span>
    </button>
  )
}
