/**
 * Marks Volita as being in beta. The title explains it on hover and long-press; the screen-reader text says the same, so the
 * badge is more than decoration.
 */
export function BetaBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Volita is in beta: it is still being polished and may change. Your feedback helps."
      className={`inline-flex items-center rounded-full border border-ember-400/60 bg-ember-500/15 px-2 py-0.5 text-[0.65rem] leading-none font-extrabold tracking-wider text-ember-700 uppercase dark:text-ember-300 ${className}`}
    >
      Beta
      <span className="sr-only">: Volita is still being polished and may change.</span>
    </span>
  )
}
