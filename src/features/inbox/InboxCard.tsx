import { MessageCircleMore, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { nativeInbox, type InboxStatus } from '../../lib/native-inbox'
import { ChatNames } from './ChatNames'

/**
 * Switches on hands-free WhatsApp catch-up in the Android app. Android keeps this behind its own "Notification access" screen,
 * so the person turns it on there; this card explains what it does and shows whether it is on. It appears only in the Android app.
 */
export function InboxCard() {
  const [status, setStatus] = useState<InboxStatus | null>(null)
  const [cleared, setCleared] = useState(false)
  /** Bumped when the saved messages change, so the list of chats below reloads. */
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => {
    void nativeInbox.status().then(setStatus)
  }, [])

  useEffect(() => {
    refresh()
    // The person comes back from Android's settings screen; look again so the card shows what they chose.
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  if (!nativeInbox.available || !status) return null

  const clear = async () => {
    await nativeInbox.clear()
    setCleared(true)
    setVersion((current) => current + 1)
    refresh()
  }

  return (
    <div className="surface w-full max-w-md p-4 text-left" data-testid="inbox-card">
      <h2 className="flex items-center gap-2 text-sm font-extrabold">
        <MessageCircleMore className="size-4 text-brand-400" aria-hidden="true" />
        WhatsApp catch-up, hands-free
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${status.enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-black/10 dark:bg-white/10'}`}>
          {status.enabled ? 'On' : 'Off'}
        </span>
      </h2>

      {status.enabled ? (
        <>
          <p className="mt-2 text-sm">Say “catch me up with Abigail” or “what did I miss?” and I will read it out. No screenshots needed.</p>
          <p className="muted mt-2 text-xs">
            {status.count} message{status.count === 1 ? '' : 's'} kept on this phone for {status.keepDays} days. Chats you muted, and chats you have open on the screen at that moment, do not show up.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void nativeInbox.openSettings()} className="btn btn-ghost">
              Notification access settings
            </button>
            <button type="button" onClick={() => void clear()} disabled={status.count === 0} className="btn btn-ghost">
              Delete saved messages
            </button>
          </div>
          {cleared && <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">Deleted from this phone.</p>}
          <ChatNames key={version + status.count} />
        </>
      ) : (
        <>
          <p className="mt-2 text-sm">
            Turn this on and Volita keeps a copy of the WhatsApp messages that reach your phone, so you can say “catch me up with Abigail” while driving, without opening WhatsApp or sending a screenshot.
          </p>
          <p className="muted mt-2 flex items-start gap-2 text-xs">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              The copy stays on this phone for {status.keepDays} days and is never uploaded. A chat is only read when you ask about it, and only then does what it says go to the assistant.
            </span>
          </p>
          <button type="button" onClick={() => void nativeInbox.openSettings()} className="btn btn-primary mt-3">
            Turn on
          </button>
          <p className="muted mt-2 text-xs">
            On the next screen, tap Volita and allow access. If Android says the setting is restricted, open the phone's Settings, then Apps, Volita, the three dots at the top right, and choose “Allow restricted settings”, then try again.
          </p>
        </>
      )}
    </div>
  )
}
