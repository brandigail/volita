import { ArrowLeft, ArrowRight, FileCheck2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TERMS_SECTIONS } from './termsSections'

/** About four words a second, so a part cannot be ticked before it could have been read; never less than 3 or more than 15 seconds. */
const MS_PER_WORD = 250
const MIN_READ_MS = 3_000
const MAX_READ_MS = 15_000

interface TermsWalkthroughProps {
  /** Called once every part has been read and ticked and the person has accepted. */
  onAccept: () => void | Promise<void>
  /** Text of the final button, for example "Accept and create my account". */
  acceptLabel: string
  busy?: boolean
  error?: string | null
}

/**
 * Every part of the terms, one at a time. A part's box can only be ticked once the person has scrolled to its end and
 * had time to read it, and Next only works once it is ticked. There is no way to skip a part or tick them all at once.
 */
export function TermsWalkthrough({ onAccept, acceptLabel, busy = false, error = null }: TermsWalkthroughProps) {
  const [index, setIndex] = useState(0)
  const [understood, setUnderstood] = useState<readonly boolean[]>(() => TERMS_SECTIONS.map(() => false))
  const [reachedEnd, setReachedEnd] = useState(false)
  const [waitMs, setWaitMs] = useState(MIN_READ_MS)
  const box = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // The ticks as of the last change, read when a part opens (ticking must not restart that part's clock).
  const understoodNow = useRef(understood)

  const section = TERMS_SECTIONS[index]
  const last = index === TERMS_SECTIONS.length - 1
  const ticked = understood[index]

  // Each new part: back to the top, the reading time worked out from its length, and the end not yet reached.
  useEffect(() => {
    const element = box.current
    if (!element) return
    element.scrollTop = 0
    heading.current?.focus()
    const already = understoodNow.current[index]
    const words = (element.textContent ?? '').split(/\s+/).filter(Boolean).length
    const needed = Math.min(MAX_READ_MS, Math.max(MIN_READ_MS, words * MS_PER_WORD))
    // Measured from the page, so it can only be worked out once the part is on screen.
    const timer = window.setTimeout(() => {
      setWaitMs(already ? 0 : needed)
      setReachedEnd(already || element.scrollHeight <= element.clientHeight + 4)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [index])

  /** Opens another part locked; the effect above unlocks it once it has been scrolled and read. */
  const goTo = (next: number) => {
    setReachedEnd(understood[next])
    setWaitMs(understood[next] ? 0 : MIN_READ_MS)
    setIndex(next)
  }

  const tick = (checked: boolean) => {
    const next = understood.map((value, i) => (i === index ? checked : value))
    understoodNow.current = next
    setUnderstood(next)
  }

  useEffect(() => {
    if (waitMs <= 0) return
    const timer = window.setTimeout(() => setWaitMs((left) => Math.max(0, left - 1000)), 1000)
    return () => window.clearTimeout(timer)
  }, [waitMs])

  const onScroll = () => {
    const element = box.current
    if (element && element.scrollTop + element.clientHeight >= element.scrollHeight - 8) setReachedEnd(true)
  }

  const canTick = reachedEnd && waitMs <= 0
  const hint = !reachedEnd ? 'Scroll to the end of this part first.' : waitMs > 0 ? `Take your time to read it (${Math.ceil(waitMs / 1000)} s).` : null

  return (
    <section aria-labelledby="terms-walk-heading" className="mx-auto max-w-lg text-left" data-testid="terms-walkthrough">
      <p className="flex items-center gap-2 text-sm font-semibold text-ember-500">
        <FileCheck2 className="size-4" aria-hidden="true" />
        Terms of use, part {index + 1} of {TERMS_SECTIONS.length}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--line)" role="progressbar" aria-label="Terms read" aria-valuemin={0} aria-valuemax={TERMS_SECTIONS.length} aria-valuenow={understood.filter(Boolean).length}>
        <div className="h-full bg-ember-500 transition-all" style={{ width: `${(understood.filter(Boolean).length / TERMS_SECTIONS.length) * 100}%` }} />
      </div>

      <div className="surface mt-4 p-5">
        <h2 id="terms-walk-heading" ref={heading} tabIndex={-1} className="text-xl font-extrabold tracking-tight outline-none">
          {section.title}
        </h2>
        <div
          ref={box}
          onScroll={onScroll}
          tabIndex={0}
          aria-label={`${section.title}, the text`}
          data-testid="terms-text"
          className="mt-3 max-h-[45dvh] overflow-y-auto pr-1 leading-relaxed [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-6"
        >
          {section.body}
        </div>

        <label className={`mt-5 flex items-start gap-3 rounded-xl border p-3 text-sm font-semibold ${canTick ? 'cursor-pointer border-ember-500/60' : 'cursor-not-allowed border-(--line) opacity-60'}`}>
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0"
            disabled={!canTick}
            checked={ticked}
            onChange={(e) => tick(e.target.checked)}
          />
          <span>I have read and understood “{section.title}”.</span>
        </label>
        {hint && !ticked && (
          <p className="muted mt-2 text-xs" aria-live="polite">
            {hint}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" className="btn btn-ghost" disabled={index === 0 || busy} onClick={() => goTo(index - 1)}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </button>
        {last ? (
          <button type="button" className="btn btn-primary" disabled={!understood.every(Boolean) || busy} onClick={() => void onAccept()}>
            {busy ? 'Saving…' : acceptLabel}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!ticked} onClick={() => goTo(index + 1)}>
            Next part
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}
