import { MessageSquareHeart, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { fetchReviews, removeReview } from '../../lib/reviews-api'
import type { ReviewsResponse } from '../../types/reviews'
import { ReviewForm } from './ReviewForm'
import { StarsDisplay } from './Stars'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

interface ReviewsSectionProps {
  /** Signed in: show the form to write your own. Signed out: show a button that starts sign-up instead. */
  signedIn: boolean
  /** Signed out only: what the "Be the first to review" button does. */
  onStart?: () => void
  /** The owner can remove a review. */
  isOwner?: boolean
}

/** What people say about Volita. Public, so it can sit on the landing page as well as inside the app. */
export function ReviewsSection({ signedIn, onStart, isOwner = false }: ReviewsSectionProps) {
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await fetchReviews())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the reviews.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchReviews()
      .then((next) => !cancelled && setData(next))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not load the reviews.'))
    return () => {
      cancelled = true
    }
  }, [])

  const remove = async (id: string) => {
    try {
      await removeReview(id)
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not remove that review.')
    }
  }

  const empty = data !== null && data.count === 0

  return (
    <div className="space-y-5" data-testid="reviews">
      {data && data.count > 0 && data.average !== null && (
        <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
          <StarsDisplay rating={data.average} size="size-6" />
          <span>{data.average.toFixed(1)}</span>
          <span className="muted text-sm font-normal">
            from {data.count} review{data.count === 1 ? '' : 's'}
          </span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {!data && !error && <p className="muted text-sm">Loading reviews…</p>}

      {empty && (
        <div className="surface flex flex-col items-center gap-3 p-8 text-center" data-testid="reviews-empty">
          <MessageSquareHeart className="size-10 text-ember-500" aria-hidden="true" />
          <p className="text-xl font-extrabold">No reviews yet</p>
          <p className="muted max-w-md">Be the first to review Volita. Tell us what works and what should be fixed.</p>
          {!signedIn && (
            <button type="button" className="btn btn-primary" onClick={onStart}>
              Be the first to review
            </button>
          )}
        </div>
      )}

      {data && data.count > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.reviews.map((review) => (
            <li key={review.id} className="surface flex flex-col gap-2 p-5" data-testid="review">
              <div className="flex items-center justify-between gap-2">
                <StarsDisplay rating={review.rating} />
                <span className="muted text-xs">{dateFormat.format(new Date(review.createdAt))}</span>
              </div>
              {review.comment && <p className="leading-relaxed">{review.comment}</p>}
              <div className="mt-auto flex items-center justify-between gap-2">
                <p className="muted text-sm font-semibold">{review.name}</p>
                {isOwner && (
                  <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => void remove(review.id)} aria-label={`Remove the review by ${review.name}`}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.count > 0 && !signedIn && (
        <button type="button" className="btn btn-primary" onClick={onStart}>
          Write a review
        </button>
      )}
      {signedIn && <ReviewForm onChanged={() => void load()} />}
    </div>
  )
}
