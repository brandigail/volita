import { useState } from 'react'
import { authClient } from '../../lib/auth-client'
import { finishOnboarding } from '../../lib/plan-api'
import { usePlan } from '../../providers/usePlan'

const TONES = ['warm and friendly', 'short and direct', 'formal and professional', 'relaxed and casual']

/** Three quick questions the first time someone signs in, so the first draft already sounds like them. Skippable. */
export function Onboarding() {
  const { state, limits, refresh } = usePlan()
  const [step, setStep] = useState(0)
  const [work, setWork] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState('')
  const [saving, setSaving] = useState(false)

  if (!state || state.onboarded) return null
  const remembers = limits.memoryItems !== 0

  const finish = async (skip: boolean) => {
    setSaving(true)
    try {
      if (!skip && work.trim()) await authClient.updateUser({ role: work.trim().slice(0, 80) })
      await finishOnboarding(skip ? {} : { audience: audience.trim() || undefined, tone: tone || undefined })
    } catch {
      // The welcome is a nicety; if it cannot be saved it simply shows again next time.
    } finally {
      setSaving(false)
      refresh()
    }
  }

  const questions = [
    {
      id: 'onboard-work',
      title: 'What do you do?',
      hint: 'For example "Plumber", "Bakery owner" or "Estate agent". It helps Volita pick the right words.',
      body: <input id="onboard-work" className="field" value={work} maxLength={80} onChange={(e) => setWork(e.target.value)} autoFocus />,
    },
    {
      id: 'onboard-audience',
      title: 'Who do you write to most?',
      hint: remembers ? 'For example "customers", "my team" or "suppliers". Volita remembers this.' : 'For example "customers" or "my team".',
      body: <input id="onboard-audience" className="field" value={audience} maxLength={100} onChange={(e) => setAudience(e.target.value)} autoFocus />,
    },
    {
      id: 'onboard-tone',
      title: 'How should your messages sound?',
      hint: remembers ? 'Pick one. Volita remembers it and you can change it any time.' : 'Pick one. Saving it is part of the Basic plan.',
      body: (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tone">
          {TONES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={tone === option}
              onClick={() => setTone(option)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${tone === option ? 'border-brand-500 bg-brand-500/20' : 'border-(--line) bg-(--surface) hover:border-brand-500'}`}
            >
              {option}
            </button>
          ))}
        </div>
      ),
    },
  ]
  const question = questions[step]
  const last = step === questions.length - 1

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="surface w-full max-w-md p-6">
        <p className="muted text-xs font-semibold">Welcome to Volita · {step + 1} of {questions.length}</p>
        <h2 id="onboard-title" className="mt-1 text-2xl font-extrabold tracking-tight">
          <label htmlFor={question.id}>{question.title}</label>
        </h2>
        <p className="muted mt-1 mb-4 text-sm">{question.hint}</p>
        {question.body}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => void finish(true)} disabled={saving} className="muted text-sm underline underline-offset-2 hover:text-(--ink)">
            Skip for now
          </button>
          <button type="button" onClick={() => (last ? void finish(false) : setStep(step + 1))} disabled={saving} className="btn btn-primary">
            {last ? (saving ? 'Saving…' : 'Done') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
