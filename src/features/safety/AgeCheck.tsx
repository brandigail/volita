import { CalendarCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { authClient } from '../../lib/auth-client'
import { BirthDateFields } from './BirthDateFields'
import { EMPTY_BIRTH_DATE, birthDateValue } from './birthDate'

/**
 * Shown once to accounts made before the age check: they give their date of birth before they can carry on. The server
 * decides; a date under 18 closes the account, so it is not a question that can be answered again with another date.
 */
export function AgeCheck() {
  const [parts, setParts] = useState(EMPTY_BIRTH_DATE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const birthDate = birthDateValue(parts)
    if (!birthDate) return setError('Choose the day, month and year.')
    setBusy(true)
    setError(null)
    try {
      const { error: refused } = await authClient.updateUser({ birthDate })
      if (refused) {
        setError(refused.message ?? 'That did not work. Please try again.')
        // An under-18 answer closes the account on the server, which also ends this session.
        if (/18/.test(refused.message ?? '')) window.setTimeout(() => window.location.assign('/'), 4000)
        return
      }
      // Fetch the session again so the app opens with the saved date.
      await authClient.getSession({ query: { disableCookieCache: true } })
      window.location.reload()
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="age-heading" className="mx-auto max-w-sm text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-ember-600 text-white">
        <CalendarCheck className="size-7" aria-hidden="true" />
      </span>
      <h1 id="age-heading" className="mt-4 text-2xl font-extrabold tracking-tight">
        One quick check
      </h1>
      <p className="muted mt-2 text-sm">Volita is for adults. Please give your date of birth to carry on. You only need to do this once.</p>
      <form onSubmit={(e) => void submit(e)} className="surface mt-6 flex flex-col gap-4 p-6 text-left">
        <BirthDateFields value={parts} onChange={setParts} idPrefix="age" />
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary py-3">
          {busy ? 'Saving…' : 'Carry on'}
        </button>
      </form>
    </section>
  )
}
