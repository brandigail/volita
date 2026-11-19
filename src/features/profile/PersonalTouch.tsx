import { Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { suggestNicknames } from '../../lib/nickname-api'
import { PROFILE_LIMITS, type Profile } from '../../types/profile'

interface PersonalTouchProps {
  profile: Profile
  onChange: (field: 'nickname' | 'businessAbout', value: string) => void
}

/** What the business does and what Volita should call the owner, so greetings sound like they are for this person. */
export function PersonalTouch({ profile, onChange }: PersonalTouchProps) {
  const [ideas, setIdeas] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggest = async () => {
    setBusy(true)
    setError(null)
    try {
      setIdeas(await suggestNicknames(profile))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not think of names just now. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-(--line) p-4">
      <legend className="px-2 text-sm font-extrabold">Make Volita personal</legend>
      <div>
        <label htmlFor="profile-about" className="mb-1.5 block text-sm font-semibold">
          What does your business do? <span className="font-normal muted">(optional)</span>
        </label>
        <input
          id="profile-about"
          className="field"
          value={profile.businessAbout}
          maxLength={PROFILE_LIMITS.businessAbout}
          placeholder="For example: I make mayonnaise and sauces"
          onChange={(e) => onChange('businessAbout', e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="profile-nickname" className="mb-1.5 block text-sm font-semibold">
          What should Volita call you? <span className="font-normal muted">(optional)</span>
        </label>
        <input
          id="profile-nickname"
          className="field"
          value={profile.nickname}
          maxLength={PROFILE_LIMITS.nickname}
          placeholder="For example: Mayoman (leave empty to use your first name)"
          onChange={(e) => onChange('nickname', e.target.value)}
        />
        <p className="muted mt-1 text-xs">Used in greetings like “Welcome back, Mayoman”. It is never put in a message to a customer.</p>
        <button type="button" onClick={() => void suggest()} disabled={busy} className="btn btn-ghost mt-2">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {busy ? 'Thinking…' : 'Suggest names'}
        </button>
        {ideas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Suggested names">
            {ideas.map((idea) => (
              <button key={idea} type="button" onClick={() => onChange('nickname', idea)} className="rounded-full border border-(--line) bg-(--surface) px-3 py-1.5 text-sm font-semibold hover:border-brand-400/70">
                {idea}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </fieldset>
  )
}
