import { Mic, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { channelsOf, EXAMPLES, type ExampleChannel } from './examples'

const TYPING_STEP_MS = 14

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Ready-made jobs to try without signing up: pick a trade, press the button, and watch the draft being written. */
export function ExampleJobs({ onStart }: { onStart: () => void }) {
  const [jobId, setJobId] = useState(EXAMPLES[0]?.id ?? '')
  const job = EXAMPLES.find((candidate) => candidate.id === jobId) ?? EXAMPLES[0]
  const channels = job ? channelsOf(job) : []
  const [channel, setChannel] = useState<ExampleChannel | null>(null)
  const [shown, setShown] = useState('')
  const [written, setWritten] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const active = channel && channels.includes(channel) ? channel : (channels[0] ?? 'WhatsApp')
  const draft = job?.drafts[active] ?? ''

  useEffect(() => () => window.clearInterval(timer.current), [])

  function stop() {
    window.clearInterval(timer.current)
  }

  function pickJob(id: string) {
    stop()
    setJobId(id)
    setChannel(null)
    setWritten(false)
    setShown('')
  }

  function pickChannel(next: ExampleChannel) {
    stop()
    setChannel(next)
    if (written) setShown(job?.drafts[next] ?? '')
  }

  function write() {
    stop()
    setWritten(true)
    if (prefersReducedMotion()) {
      setShown(draft)
      return
    }
    let length = 0
    setShown('')
    timer.current = window.setInterval(() => {
      length += 4
      setShown(draft.slice(0, length))
      if (length >= draft.length) stop()
    }, TYPING_STEP_MS)
  }

  if (!job) return null

  return (
    <div className="surface p-5 sm:p-6" data-testid="examples">
      <div role="tablist" aria-label="Choose a trade" className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example.id}
            type="button"
            role="tab"
            aria-selected={example.id === job.id}
            onClick={() => pickJob(example.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${example.id === job.id ? 'border-brand-500 bg-brand-500 text-white' : 'border-(--line) hover:border-brand-500'}`}
          >
            {example.trade}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <p className="muted flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
            <Mic className="size-3.5" aria-hidden="true" />
            You say
          </p>
          <blockquote className="mt-2 rounded-2xl border border-(--line) p-4 text-[0.95rem] leading-relaxed">“{job.say}”</blockquote>
          <div role="group" aria-label="What to write" className="mt-3 flex flex-wrap gap-2">
            {channels.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={name === active}
                onClick={() => pickChannel(name)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${name === active ? 'border-ember-500 bg-ember-500/15' : 'border-(--line) hover:border-ember-500'}`}
              >
                {name}
              </button>
            ))}
          </div>
          <button type="button" onClick={write} className="btn btn-primary mt-4">
            <Sparkles className="size-4" aria-hidden="true" />
            {written ? 'Write it again' : `Write the ${active === 'Quote' ? 'quote' : active === 'Email' ? 'email' : 'message'}`}
          </button>
        </div>

        <div>
          <p className="muted flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Volita writes
          </p>
          <div aria-live="polite" className="mt-2 min-h-56 rounded-2xl border border-(--line) bg-(--surface-strong) p-4 font-mono text-[0.82rem] leading-relaxed whitespace-pre-wrap" data-testid="example-draft">
            {written ? shown : <span className="muted font-sans">Press the button to see what Volita writes from that one sentence.</span>}
          </div>
        </div>
      </div>

      <p className="muted mt-4 text-sm">
        These are examples with made-up names and prices.{' '}
        <button type="button" onClick={onStart} className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-400">
          Say your own job, free for 14 days
        </button>
        .
      </p>
    </div>
  )
}
