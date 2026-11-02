import { Camera, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { UpgradeNote } from '../../components/UpgradeNote'
import { ApiRequestError } from '../../lib/api'
import { captionPhoto } from '../../lib/plan-api'
import { usePlan } from '../../providers/usePlan'
import type { DraftCategory, GeneratedDraft } from '../../types/draft'

/** Longest side of the photo sent for captioning; keeps the upload small and fast. */
const MAX_SIDE = 1024
const JPEG_QUALITY = 0.8

/** Shrinks a photo in the browser and returns it as a JPEG data URL. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

interface PhotoCaptionProps {
  category: DraftCategory
  onDraft: (draft: GeneratedDraft, note: string) => void
  onSeePlans: () => void
}

/** Start from a photo instead of a recording: pick or take one, optionally say what it is, and Volita writes the post. */
export function PhotoCaption({ category, onDraft, onSeePlans }: PhotoCaptionProps) {
  const { limits, refresh } = usePlan()
  const input = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  const choose = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { draft } = await captionPhoto(await shrink(file), category, note.trim())
      onDraft(draft, note.trim() || 'Photo')
      refresh()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not read that photo. Try another one.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="surface w-full p-4 text-left">
      <label htmlFor="photo-note" className="mb-1.5 block text-sm font-semibold">
        Or start from a photo <span className="muted font-normal">(optional note)</span>
      </label>
      <input
        id="photo-note"
        className="field"
        value={note}
        maxLength={300}
        placeholder="For example: finished bathroom, new tiles"
        onChange={(e) => setNote(e.target.value)}
      />
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void choose(e.target.files?.[0])} />
      <button
        type="button"
        disabled={busy}
        onClick={() => (limits.photoCaption ? input.current?.click() : setLocked(true))}
        className="btn btn-ghost mt-3"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
        {busy ? 'Reading your photo…' : 'Choose or take a photo'}
      </button>
      {locked && !limits.photoCaption && (
        <div className="mt-3">
          <UpgradeNote message="Photo to caption is part of the Basic plan." needs="basic" onSeePlans={onSeePlans} />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
