import { Ban, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { authClient } from '../../lib/auth-client'
import { onRefusal, type Refusal } from '../../lib/refusals'

/**
 * The pop-up for safety refusals, wherever in the app they happen: text with card numbers, bank details or passwords
 * that Volita will not send, and an account the owner has closed. (A missing date of birth has its own screen.)
 */
export function SafetyNotice() {
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => onRefusal((next) => next.code !== 'age_required' && setRefusal(next)), [])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (refusal && !element.open) element.showModal()
    if (!refusal && element.open) element.close()
  }, [refusal])

  const closedAccount = refusal?.code === 'suspended'

  const dismiss = async () => {
    if (closedAccount) {
      await authClient.signOut().catch(() => undefined)
      window.location.assign('/')
      return
    }
    setRefusal(null)
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="safety-heading"
      data-testid="safety-notice"
      onCancel={(event) => {
        event.preventDefault()
        void dismiss()
      }}
      className="surface m-auto w-[min(26rem,calc(100vw-2rem))] p-6 text-(--ink) backdrop:bg-black/60"
    >
      {refusal && (
        <>
          <h2 id="safety-heading" className="flex items-center gap-2 text-xl font-extrabold">
            {closedAccount ? <Ban className="size-6 text-red-500" aria-hidden="true" /> : <ShieldAlert className="size-6 text-amber-500" aria-hidden="true" />}
            {closedAccount ? 'This account is closed' : 'Volita cannot send this'}
          </h2>
          {/* The heading already says it, so the message's own first sentence is not repeated under it. */}
          <p className="mt-3 text-sm leading-relaxed">{refusal.message.replace(/^Volita cannot send this\.\s*/, '')}</p>
          <button type="button" className="btn btn-primary mt-5 w-full" onClick={() => void dismiss()} autoFocus>
            {closedAccount ? 'Sign out' : 'OK, I will leave them out'}
          </button>
        </>
      )}
    </dialog>
  )
}
