import { Camera, ClipboardList, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { shrinkImage } from '../../lib/image'
import { buildJobSheetPdf } from '../../lib/job-sheet-pdf'
import { deliverPdf } from '../../lib/quote-pdf'
import type { Profile } from '../../types/profile'
import { todayLocal } from './dates'

const MAX_PHOTOS = 6
const PHOTO_SIDE = 1200
const PHOTO_QUALITY = 0.7
const MAX_WORK_CHARS = 3_000

/** A job report for a customer: what was done and the photos, as a PDF made on the phone to send with the invoice. */
export function JobSheet({ customer, profile }: { customer: string; profile: Profile }) {
  const input = useRef<HTMLInputElement>(null)
  const [work, setWork] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (files: FileList | null) => {
    if (!files) return
    setError(null)
    try {
      const room = Array.from(files).slice(0, MAX_PHOTOS - photos.length)
      const added = await Promise.all(room.map((file) => shrinkImage(file, PHOTO_SIDE, PHOTO_QUALITY)))
      setPhotos((current) => [...current, ...added])
    } catch {
      setError('One of those photos could not be read. Try another.')
    }
    if (input.current) input.current.value = ''
  }

  const make = async () => {
    setBusy(true)
    setError(null)
    try {
      await deliverPdf(await buildJobSheetPdf({ customer, work: work.trim(), photos, date: todayLocal() }, profile))
    } catch {
      setError('Could not make the PDF. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rounded-2xl border border-(--line) p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <ClipboardList className="size-4" aria-hidden="true" />
        Job sheet for {customer}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor="job-work" className="mb-1.5 block text-sm font-semibold">
            Work done
          </label>
          <textarea id="job-work" className="field min-h-28" value={work} maxLength={MAX_WORK_CHARS} placeholder="What you did, in your own words. Use your keyboard’s microphone to say it." onChange={(e) => setWork(e.target.value)} />
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
        <div className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <div key={index} className="relative">
              <img src={photo} alt={`Job photo ${index + 1}`} className="size-20 rounded-xl object-cover" />
              <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))} className="absolute -top-2 -right-2 rounded-full bg-slate-900 p-1 text-white">
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" onClick={() => input.current?.click()} className="btn btn-ghost">
              <Camera className="size-4" aria-hidden="true" />
              Add photos
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="button" onClick={() => void make()} disabled={busy || (work.trim() === '' && photos.length === 0)} className="btn btn-primary self-start">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Make the job sheet PDF
        </button>
        <p className="muted text-xs">Made on your phone. The photos are not uploaded anywhere.</p>
      </div>
    </details>
  )
}
