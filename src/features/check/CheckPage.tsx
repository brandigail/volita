import { AlertTriangle, CheckCircle2, ClipboardCheck, Copy, Info, Loader2, Mail, Share2, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { SITE, supportMailto } from '../../config/site'
import { LegalLayout } from '../legal/LegalLayout'
import { micChecks, playBeep, quickChecks, speakWithPhone, wakeLockCheck, yesNo } from './checks'
import { describeDevice, deviceLine, headline, reportText, summarise, type CheckResult, type CheckStatus } from './report'

const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches

const LOOK: Record<CheckStatus, { icon: typeof Info; word: string; colour: string }> = {
  pass: { icon: CheckCircle2, word: 'Works', colour: 'text-emerald-600 dark:text-emerald-400' },
  warn: { icon: AlertTriangle, word: 'Look at this', colour: 'text-amber-600 dark:text-amber-400' },
  fail: { icon: XCircle, word: 'Did not work', colour: 'text-red-600 dark:text-red-400' },
  info: { icon: Info, word: 'Good to know', colour: 'muted' },
}

interface Question {
  text: string
  options: { label: string; value: string }[]
}

const YES_NO = [
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
]

/**
 * The "Check my phone" page. It tests, on the phone itself, the things that decide whether Volita works there: the microphone,
 * recording, sound, the screen staying on, and reaching Volita. It needs no sign-in, saves nothing, and sends nothing unless the
 * person taps Share or Email to pass the result on.
 */
export function CheckPage() {
  const [phase, setPhase] = useState<'start' | 'running' | 'done'>('start')
  const [doing, setDoing] = useState('')
  const [results, setResults] = useState<CheckResult[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const answerRef = useRef<((value: string) => void) | null>(null)
  const [report, setReport] = useState('')

  const device = describeDevice(navigator.userAgent, installed)
  const screen = `${window.screen.width}x${window.screen.height}`

  const ask = (text: string, options: Question['options']) =>
    new Promise<string>((resolve) => {
      answerRef.current = resolve
      setQuestion({ text, options })
    })
  const answer = (value: string) => {
    setQuestion(null)
    answerRef.current?.(value)
  }

  const run = async () => {
    setPhase('running')
    setNote(null)
    const all: CheckResult[] = []
    const add = (list: CheckResult[]) => {
      all.push(...list)
      setResults([...all])
    }
    setResults([])

    setDoing('Checking the basics…')
    add(await quickChecks(installed))

    setDoing('Asking for the microphone. Tap Allow if your phone asks.')
    add((await micChecks(() => setDoing('Listening for a moment. Say a few words now.'))).results)

    // Each sound test starts from its own tap: a phone only lets a page make sound straight after one, as Volita itself needs.
    setDoing('Next: a sound test.')
    await ask('Turn the volume up, then tap the button.', [{ label: 'Play a beep', value: 'go' }])
    const beep = await playBeep()
    if (beep.started) {
      const heard = await ask('Did you hear a beep?', YES_NO)
      beep.stop()
      add([yesNo.beepHeard(heard === 'yes')])
    } else {
      add([yesNo.beepBlocked()])
    }

    if ('speechSynthesis' in window) {
      setDoing('Next: the phone’s own voice.')
      await ask('Tap the button and listen.', [{ label: 'Make the phone speak', value: 'go' }])
      await speakWithPhone('Volita check. Can you hear me?')
      add([yesNo.voiceHeard((await ask('Did you hear the phone say "Volita check"?', YES_NO)) === 'yes')])
    }

    setDoing('Checking the screen can stay on…')
    add([await wakeLockCheck()])

    setDoing('')
    setReport(reportText(device, screen, all, new Date()))
    setPhase('done')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setNote('Copied. Paste it into a message to us.')
    } catch {
      setNote('Could not copy. Press and hold the report to select it, then copy.')
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: 'Volita phone check', text: report })
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  }

  const summary = summarise(results)

  return (
    <LegalLayout title="Check my phone" intro="About a minute. It tests the things Volita needs on this phone.">
      <section className="surface p-5">
        <h2 className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-brand-400" aria-hidden="true" />
          This phone
        </h2>
        <p>{deviceLine(device)}</p>
        <p className="muted text-sm">Nothing is saved, and nothing is sent anywhere unless you tap Share or Email at the end. Your recording is checked on the phone and thrown away.</p>
        {phase !== 'running' && (
          <button type="button" onClick={() => void run()} className="btn btn-primary mt-3">
            {phase === 'done' ? 'Check again' : 'Start the check'}
          </button>
        )}
      </section>

      {phase === 'running' && (
        <section aria-live="polite" className="surface p-5">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            {doing || 'Working…'}
          </p>
          {question && (
            <div className="mt-3" role="group" aria-label={question.text}>
              <p className="font-semibold">{question.text}</p>
              <div className="mt-2 flex gap-2">
                {question.options.map((option) => (
                  <button key={option.value} type="button" onClick={() => answer(option.value)} className="btn btn-primary">
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {results.length > 0 && (
        <section>
          {phase === 'done' && <h2 role="status">{headline(summary)}</h2>}
          <ul className="space-y-3">
            {results.map((item) => {
              const look = LOOK[item.status]
              const Icon = look.icon
              return (
                <li key={item.id} className="flex gap-3">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${look.colour}`} aria-hidden="true" />
                  <div>
                    <p className="font-semibold">
                      {item.label} <span className={`text-sm font-normal ${look.colour}`}>· {look.word}</span>
                    </p>
                    <p className="muted text-sm">{item.detail}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {phase === 'done' && (
        <section className="surface p-5">
          <h2>Send the result</h2>
          <p className="muted text-sm">If anything did not work, send this to us. It has no name or account details in it.</p>
          <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-dashed border-(--line) p-3 font-sans text-xs whitespace-pre-wrap select-all">{report}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className="btn btn-ghost">
              <Copy className="size-4" aria-hidden="true" />
              Copy
            </button>
            {typeof navigator.share === 'function' && (
              <button type="button" onClick={() => void share()} className="btn btn-ghost">
                <Share2 className="size-4" aria-hidden="true" />
                Share
              </button>
            )}
            <a href={`${supportMailto('Volita phone check')}&body=${encodeURIComponent(report)}`} className="btn btn-ghost">
              <Mail className="size-4" aria-hidden="true" />
              Email it to {SITE.name} support
            </a>
          </div>
          {note && (
            <p role="status" className="mt-2 text-sm">
              {note}
            </p>
          )}
        </section>
      )}
    </LegalLayout>
  )
}
