import { Check, Copy, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { createShortcutToken, fetchShortcutStatus, revokeShortcutToken, type ShortcutStatus } from '../../lib/shortcut-api'

const READ_URL = `${typeof window === 'undefined' ? '' : window.location.origin}/api/read-chat`

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

/**
 * Sets up the iPhone "Catch me up" Shortcut. An iPhone cannot share a screenshot into the installed web app, so the Shortcut
 * sends it to Volita with a personal access code instead. The code can only read chat screenshots and can be replaced or removed here.
 */
export function ShortcutSection() {
  const [status, setStatus] = useState<ShortcutStatus | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchShortcutStatus()
      .then(setStatus)
      .catch(() => setStatus({ exists: false, createdAt: null, lastUsedAt: null }))
  }, [])
  useEffect(load, [load])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const make = () =>
    run(async () => {
      setToken(await createShortcutToken())
      setCopied(false)
      load()
    })

  const remove = () =>
    run(async () => {
      await revokeShortcutToken()
      setToken(null)
      load()
    })

  const copy = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
    } catch {
      setError('Could not copy. Press and hold the code to copy it.')
    }
  }

  return (
    <section aria-labelledby="shortcut-heading" className="mt-10">
      <h2 id="shortcut-heading" className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Smartphone className="size-6 text-brand-400" aria-hidden="true" />
        iPhone Shortcut: catch me up
      </h2>
      <p className="muted mt-1 text-sm">
        On an iPhone, a screenshot can&apos;t be shared into Volita directly. This Shortcut sends it for you and reads the summary out loud, even with the screen locked. It uses a personal access code that can only read chat screenshots.
      </p>

      <div className="surface mt-4 flex flex-col gap-4 p-5">
        {token ? (
          <div>
            <p className="text-sm font-semibold">Your access code. It is shown once: copy it into the Shortcut now.</p>
            <p className="field mt-2 font-mono text-xs break-all select-all">{token}</p>
            <button type="button" onClick={() => void copy()} className="btn btn-ghost mt-2">
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy the code'}
            </button>
          </div>
        ) : (
          <p className="text-sm">
            {status?.exists ? `You have an access code (made ${when(status.createdAt)}, last used ${when(status.lastUsedAt)}). For safety it can't be shown again.` : 'You have no access code yet.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void make()} disabled={busy} className="btn btn-primary">
            {status?.exists ? 'Make a new code (the old one stops working)' : 'Make my access code'}
          </button>
          {status?.exists && (
            <button type="button" onClick={() => void remove()} disabled={busy} className="btn btn-ghost">
              Remove the code
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">How to set up the Shortcut (about 3 minutes)</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Open the Shortcuts app on the iPhone, tap +, and name it “Catch me up”.</li>
            <li>Tap the (i) button and turn on “Show in Share Sheet”, so it accepts Images. (For Back Tap or the Action Button, add the action “Take Screenshot” first instead.)</li>
            <li>Add the action “Resize Image” and set the width to 1000.</li>
            <li>Add the action “Convert Image” and choose JPEG.</li>
            <li>
              Add “Get Contents of URL”. URL: <span className="font-mono text-xs break-all">{READ_URL}</span>. Tap Show More: Method POST. Add two headers: <span className="font-mono text-xs">Authorization</span> with the value{' '}
              <span className="font-mono text-xs">Bearer</span> then a space then your access code, and <span className="font-mono text-xs">Content-Type</span> with the value <span className="font-mono text-xs">image/jpeg</span>. Request Body: File, and choose the Converted Image.
            </li>
            <li>Add “Get Dictionary Value”: get the value for the key <span className="font-mono text-xs">readout</span> from the Contents of URL.</li>
            <li>Add “Speak Text” with the Dictionary Value (and “Show Result” if you also want to read it).</li>
            <li>Screenshot a WhatsApp chat, tap the preview, tap Share, and choose “Catch me up”. To start it with two taps on the back of the phone: Settings, Accessibility, Touch, Back Tap.</li>
          </ol>
          <p className="muted mt-3">Each catch-up counts toward your daily limit. The screenshot is read and then forgotten.</p>
        </details>
      </div>
    </section>
  )
}
