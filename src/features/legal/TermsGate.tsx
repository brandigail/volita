import { useState } from 'react'
import { authClient } from '../../lib/auth-client'
import { TERMS_VERSION } from '../../lib/terms'
import { TermsWalkthrough } from './TermsWalkthrough'

/**
 * For accounts that have not accepted the current terms (made before the walkthrough existed, or the terms changed):
 * nothing else opens until every part has been read and ticked. The server refuses every request until then as well.
 */
export function TermsGate() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const { error: refused } = await authClient.updateUser({ termsVersion: TERMS_VERSION })
      if (refused) return setError(refused.message ?? 'That did not save. Please try again.')
      window.location.reload()
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Before you carry on</h1>
        <p className="muted mt-2 text-sm">Please go through the terms of use, one part at a time, and tick that you understood each part. You only need to do this once, or again if the terms change.</p>
      </header>
      <TermsWalkthrough acceptLabel="I accept the terms" onAccept={accept} busy={busy} error={error} />
    </div>
  )
}
