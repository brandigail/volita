import { useEffect, useState, type FormEvent } from 'react'
import { ApiRequestError } from '../../lib/api'
import { fetchMyReview, removeReview, saveReview } from '../../lib/reviews-api'
import { MAX_REVIEW_CHARS } from '../../types/reviews'
import { StarPicker } from './Stars'

/** Write, change or delete your own review. Needs an account, so it only appears inside the app. */
export function ReviewForm({ onChanged }: { onChanged: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [had, setHad] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMyReview()
      .then((mine) => {
        if (cancelled) return
        if (mine) {
          setHad(true)
          setRating(mine.rating)
          setComment(mine.comment)
        }
        setLoaded(true)
      })
      .catch(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (rating === 0) return setNote({ text: 'Tap a star first.', error: true })
    setBusy(true)
    setNote(null)
    try {
      await saveReview({ rating, comment })
      setHad(true)
      setNote({ text: had ? 'Your review is updated. Thank you!' : 'Thank you! Your review is on the page.', error: false })
      onChanged()
    } catch (err) {
      setNote({ text: err instanceof ApiRequestError ? err.message : 'Could not save your review. Please try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await removeReview()
      setHad(false)
      setRating(0)
      setComment('')
      setNote({ text: 'Your review was deleted.', error: false })
      onChanged()
    } catch (err) {
      setNote({ text: err instanceof ApiRequestError ? err.message : 'Could not delete it. Please try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <p className="muted text-sm">Checking…</p>

  return (
    <form onSubmit={(e) => void submit(e)} className="surface space-y-4 p-5" aria-label="Write a review" data-testid="review-form">
      <div>
        <p className="font-semibold">{had ? 'Your review' : 'How is Volita working for you?'}</p>
        <p className="muted text-sm">Be honest. If something confused you, broke or annoyed you, say so: that is how it gets fixed. Only your first name is shown.</p>
      </div>
      <StarPicker value={rating} onChange={setRating} />
      <div>
        <label htmlFor="review-comment" className="mb-1.5 block text-sm font-semibold">
          What worked, and what should be fixed?
        </label>
        <textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={MAX_REVIEW_CHARS} rows={4} className="field resize-y" />
        <p className="muted mt-1 text-right text-xs">
          {comment.length} / {MAX_REVIEW_CHARS}
        </p>
      </div>
      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`text-sm font-semibold ${note.error ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
          {note.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : had ? 'Update my review' : 'Post my review'}
        </button>
        {had && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void remove()}>
            Delete my review
          </button>
        )}
      </div>
    </form>
  )
}
