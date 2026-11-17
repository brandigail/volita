import { Star } from 'lucide-react'

/** Five stars showing a rating. Purely visual, with the rating spoken for screen readers. */
export function StarsDisplay({ rating, size = 'size-4' }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={`${size} ${n <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-(--line)'}`} />
      ))}
    </span>
  )
}

const WORDS = ['', 'Poor', 'Not great', 'OK', 'Good', 'Great'] as const

/** Five buttons to choose a rating: works with a finger, a mouse and the keyboard. */
export function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div>
      <div role="radiogroup" aria-label="Your rating" className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}, ${WORDS[n]}`}
            onClick={() => onChange(n)}
            className="cursor-pointer rounded-lg p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ember-500"
          >
            <Star aria-hidden="true" className={`size-9 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-(--line)'}`} />
          </button>
        ))}
      </div>
      <p className="muted mt-1 h-5 text-sm">{value > 0 ? WORDS[value] : 'Tap a star'}</p>
    </div>
  )
}
