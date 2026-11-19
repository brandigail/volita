import { Car, Loader2, MessageCircle, Mic, Square } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { isAndroidApp } from '../../lib/native-listening'
import { useAssistant, type AssistantPhase } from './useAssistant'

/** One big word for what Volita is doing, readable at a glance. */
const WORD: Record<AssistantPhase, string> = {
  idle: 'Tap to start',
  starting: 'Starting',
  listening: 'Listening',
  hearing: 'Go on…',
  thinking: 'Thinking',
  speaking: 'Speaking',
}

/** Short text under the word: what a tap does right now. */
const HINT: Record<AssistantPhase, string> = {
  idle: '',
  starting: '',
  listening: 'Just talk',
  hearing: 'Tap when you are done',
  thinking: '',
  speaking: 'Tap to cut in',
}

interface DrivingModeProps {
  onClose: () => void
}

/**
 * Driving mode: one big button, everything is read out loud, nothing needs reading, and nothing is written to anyone until
 * the person says "send it". It is the assistant with its replies kept short (see the driving rules on the server).
 */
export function DrivingMode({ onClose }: DrivingModeProps) {
  const [understood, setUnderstood] = useState(false)
  const { phase, error, tapOrb, end, orbRef, reply } = useAssistant({ driving: true })

  const leave = () => {
    end()
    onClose()
  }
  const working = phase === 'starting' || phase === 'thinking'

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 p-5 text-white" role="dialog" aria-modal="true" aria-label="Driving mode">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-lg font-extrabold">
          <Car className="size-6" aria-hidden="true" />
          Driving mode
        </p>
        <button type="button" onClick={leave} className="flex min-h-14 items-center gap-2 rounded-2xl bg-red-600 px-6 text-lg font-extrabold hover:bg-red-500">
          <Square className="size-5" fill="currentColor" aria-hidden="true" />
          Stop
        </button>
      </div>

      {!understood ? (
        <div className="m-auto flex w-full max-w-md flex-col gap-5 text-center">
          <h1 className="text-3xl font-extrabold">Before you drive</h1>
          <ul className="space-y-3 text-left text-lg">
            <li>Put the phone in a holder, then start. Only use this where the law allows hands-free use.</li>
            <li>Volita reads everything out loud and speaks short answers.</li>
            <li>Nothing is sent unless you say “send it”. Even then WhatsApp opens with your words filled in, and you press Send when it is safe.</li>
            {!isAndroidApp && <li>Volita cannot read your WhatsApp messages on this phone. That works only in the Android app.</li>}
            <li>Pull over for anything that needs your eyes or hands.</li>
          </ul>
          <button
            type="button"
            onClick={() => {
              setUnderstood(true)
              tapOrb()
            }}
            className="min-h-20 rounded-3xl bg-emerald-500 text-2xl font-extrabold text-slate-950 hover:bg-emerald-400"
          >
            I understand. Start
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div ref={orbRef} className="relative flex w-full items-center justify-center" style={{ '--level': 0 } as CSSProperties}>
            <button
              type="button"
              onClick={tapOrb}
              disabled={working}
              aria-label={`${WORD[phase]}. ${HINT[phase]}`}
              className="flex aspect-square w-[min(80vw,48vh)] flex-col items-center justify-center gap-3 rounded-full bg-linear-to-br from-emerald-500 via-teal-500 to-orange-500 text-slate-950 shadow-[0_0_80px_-10px_rgb(20_184_166/0.7)] transition-transform duration-75 disabled:opacity-80"
              style={{ transform: phase === 'hearing' ? 'scale(calc(1 + var(--level) * 0.12))' : 'scale(1)' }}
            >
              {working ? <Loader2 className="size-20 motion-safe:animate-spin" aria-hidden="true" /> : <Mic className="size-20" aria-hidden="true" />}
              <span className="text-4xl font-extrabold">{WORD[phase]}</span>
              {HINT[phase] && <span className="text-lg font-semibold">{HINT[phase]}</span>}
            </button>
          </div>

          {reply.needsTap && reply.pending && (
            <button type="button" onClick={() => void reply.open()} className="flex min-h-16 w-full max-w-md items-center justify-center gap-3 rounded-3xl bg-emerald-500 text-xl font-extrabold text-slate-950 hover:bg-emerald-400">
              <MessageCircle className="size-6" aria-hidden="true" />
              Open WhatsApp
            </button>
          )}
          {error && (
            <p role="alert" className="max-w-md text-center text-lg font-semibold text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
