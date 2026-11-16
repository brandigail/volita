import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { describeMediaProblem } from '../../lib/mediaProblem'
import { playVoice, stopVoice } from './voicePlayer'

interface VoiceSample {
  id: 'diana' | 'hannah' | 'autumn' | 'austin' | 'daniel' | 'troy'
  name: string
  kind: string
}

const VOICES: readonly VoiceSample[] = [
  { id: 'diana', name: 'Diana', kind: 'Female voice' },
  { id: 'hannah', name: 'Hannah', kind: 'Female voice' },
  { id: 'autumn', name: 'Autumn', kind: 'Female voice' },
  { id: 'austin', name: 'Austin', kind: 'Male voice' },
  { id: 'daniel', name: 'Daniel', kind: 'Male voice' },
  { id: 'troy', name: 'Troy', kind: 'Male voice' },
]

/** What each clip says, so the words on the page match what is heard. */
const LINES = ["Hi, I'm listening. What can I do for you?", 'Would you like me to read you back your draft?']

/** Plays the real assistant voices from files that ship with the app: no sign-up, no cost, nothing sent anywhere. */
export function VoiceSamples() {
  const [playing, setPlaying] = useState<VoiceSample['id'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => stopVoice, [])

  async function toggle(voice: VoiceSample) {
    setError(null)
    if (playing === voice.id) {
      stopVoice()
      setPlaying(null)
      return
    }
    setPlaying(voice.id)
    try {
      await playVoice([`/voice/${voice.id}/greeting.wav`, `/voice/${voice.id}/readback.wav`], {
        onEnd: () => setPlaying(null),
        onError: () => {
          setPlaying(null)
          void describeMediaProblem(`/voice/${voice.id}/greeting.wav`).then((why) => setError(`That voice could not be played. ${why}`))
        },
      })
    } catch {
      setPlaying(null)
      setError('Your browser blocked the sound. Tap the button again.')
    }
  }

  return (
    <div data-testid="voice-samples">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VOICES.map((voice) => {
          const active = playing === voice.id
          return (
            <li key={voice.id}>
              <button
                type="button"
                onClick={() => void toggle(voice)}
                aria-pressed={active}
                aria-label={`${active ? 'Stop' : 'Hear'} ${voice.name}`}
                className={`surface flex w-full items-center gap-3 p-4 text-left hover:border-brand-500 ${active ? 'ring-2 ring-brand-500' : ''}`}
              >
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-ember-700 to-ember-500 text-white">
                  {active ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
                </span>
                <span>
                  <span className="block font-bold">{voice.name}</span>
                  <span className="muted block text-sm">{voice.kind}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="muted mt-3 text-sm">Each voice says: “{LINES[0]}” and “{LINES[1]}”</p>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
