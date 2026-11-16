import { useState, type FormEvent } from 'react'
import { ArrowLeft, AudioWaveform, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { authClient } from '../../lib/auth-client'
import { UNDER_AGE_MESSAGE, isAdult } from '../../lib/age'
import { BirthDateFields } from '../safety/BirthDateFields'
import { EMPTY_BIRTH_DATE, birthDateValue } from '../safety/birthDate'
import { TERMS_VERSION } from '../../lib/terms'
import { TermsWalkthrough } from '../legal/TermsWalkthrough'

type Mode = 'sign-in' | 'sign-up'

const fieldClass =
  'field'

interface AuthScreenProps {
  /** Which form to open with: the landing page's "Sign in" and "Try free" buttons choose. */
  initialMode?: Mode
  /** Back to the landing page, when that is where the person came from. */
  onBack?: () => void
}

export function AuthScreen({ initialMode = 'sign-in', onBack }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [birth, setBirth] = useState(EMPTY_BIRTH_DATE)
  // A new account starts with the terms: the sign-up form only opens once every part has been read and ticked.
  const [termsAccepted, setTermsAccepted] = useState(false)

  const signingUp = mode === 'sign-up'

  const switchMode = () => {
    setMode(signingUp ? 'sign-in' : 'sign-up')
    setError(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const birthDate = birthDateValue(birth)
    if (signingUp && !birthDate) return setError('Choose the day, month and year you were born.')
    if (signingUp && !isAdult(birthDate)) return setError(UNDER_AGE_MESSAGE)
    setBusy(true)
    setError(null)
    try {
      const { error: authError } = signingUp
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, birthDate: birthDate ?? undefined, termsVersion: TERMS_VERSION })
        : await authClient.signIn.email({ email: email.trim(), password })
      // On success the session hook updates and App swaps this screen for the app.
      if (authError) setError(signingUp && authError.status === 400 && /sign.?up/i.test(authError.message ?? '') ? 'New accounts are closed right now. Ask the owner to add you.' : (authError.message ?? 'Something went wrong. Please try again.'))
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (signingUp && !termsAccepted) {
    return (
      <div className="space-y-4">
        {onBack && (
          <button type="button" onClick={onBack} className="muted inline-flex items-center gap-1.5 text-sm font-semibold hover:text-(--ink)">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the home page
          </button>
        )}
        <header className="mx-auto max-w-lg text-center">
          <h1 id="auth-heading" className="text-3xl font-extrabold tracking-tight">
            First, the terms of use
          </h1>
          <p className="muted mt-2 text-sm">Before you create an account, please go through each part and tick that you understood it. It takes about two minutes.</p>
        </header>
        <TermsWalkthrough acceptLabel="I accept, create my account" onAccept={() => setTermsAccepted(true)} />
        <p className="text-center text-sm muted">
          Already have an account?{' '}
          <button type="button" onClick={switchMode} className="font-semibold text-brand-700 underline hover:text-ember-400 dark:text-brand-400">
            Sign in
          </button>
        </p>
      </div>
    )
  }

  return (
    <section aria-labelledby="auth-heading" className="mx-auto max-w-sm text-center">
      {onBack && (
        <button type="button" onClick={onBack} className="muted mb-4 inline-flex items-center gap-1.5 text-sm font-semibold hover:text-(--ink)">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the home page
        </button>
      )}
      <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-ember-700 via-ember-600 to-ember-500 text-white shadow-xl shadow-ember-600/40">
        <AudioWaveform className="size-8" aria-hidden="true" />
      </span>
      <h1 id="auth-heading" className="mt-5 text-3xl font-extrabold tracking-tight">
        {signingUp ? 'Create your account' : 'Sign in'}
      </h1>
      <p className="mt-2 muted">
        {signingUp ? 'Drafts will be written and signed in your name.' : 'Speak it once. Send it as an email, WhatsApp, SMS or social post.'}
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="surface mt-6 flex flex-col gap-4 p-6 text-left">
        {signingUp && (
          <div>
            <label htmlFor="auth-name" className="mb-1.5 block text-sm font-semibold">
              Your name
            </label>
            <input
              id="auth-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              className={fieldClass}
            />
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className="mb-1.5 block text-sm font-semibold">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1.5 block text-sm font-semibold">
            Password
          </label>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              minLength={8}
              required
              aria-describedby={signingUp ? 'auth-password-hint' : undefined}
              className={`${fieldClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="muted absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg hover:text-(--ink)"
            >
              {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
            </button>
          </div>
          {signingUp && (
            <p id="auth-password-hint" className="mt-1 text-xs muted">
              At least 8 characters.
            </p>
          )}
        </div>
        {signingUp && (
          <>
            <BirthDateFields value={birth} onChange={setBirth} idPrefix="auth-birth" />
            <p className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300" data-testid="terms-accepted-note">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                You went through every part of the{' '}
                <a href="/terms" target="_blank" rel="noreferrer" className="underline">
                  terms of use
                </a>{' '}
                and accepted them.
              </span>
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary py-3"
        >
          {busy ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm muted">
        {signingUp ? 'Already have an account?' : 'New here?'}{' '}
        <button
          type="button"
          onClick={switchMode}
          className="font-semibold text-brand-700 dark:text-brand-400 underline hover:text-ember-400"
        >
          {signingUp ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </section>
  )
}
