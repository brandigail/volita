import { Camera, Loader2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { ApiRequestError } from '../../lib/api'
import { saveContact } from '../../lib/memory-api'
import { scanCard } from '../../lib/scan-api'
import { MEMORY_LIMITS } from '../../types/memory'

interface Details {
  name: string
  phone: string
  email: string
  relationship: string
}

/** Saves a person from a photo of their business card. The photo is read once and thrown away; the person checks the details before they are saved. */
export function CardScan({ onSaved }: { onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [details, setDetails] = useState<Details | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof Details) => (value: string) => setDetails((current) => (current ? { ...current, [key]: value } : current))

  const read = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    setError(null)
    setMessage(null)
    try {
      const card = await scanCard(file)
      if (card.name === '' && card.phone === '' && card.email === '') {
        setError('That did not look like a business card, or the writing was too small. Try a closer photo.')
        return
      }
      setDetails({ name: card.name, phone: card.phone, email: card.email, relationship: [card.role, card.company].filter(Boolean).join(', ').slice(0, MEMORY_LIMITS.relationship) })
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not read that card. Please try again.')
    } finally {
      setReading(false)
      if (input.current) input.current.value = ''
    }
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!details || details.name.trim() === '') return setError('Who is it? Type their name.')
    setSaving(true)
    setError(null)
    try {
      await saveContact({ name: details.name.trim(), email: details.email.trim(), phone: details.phone.trim(), relationship: details.relationship.trim(), notes: '' })
      setMessage(`${details.name.trim()} is saved.`)
      setDetails(null)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void read(e.target.files?.[0])} />
      {!details && (
        <button type="button" onClick={() => input.current?.click()} disabled={reading} className="btn btn-ghost">
          {reading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
          {reading ? 'Reading the card…' : 'Scan a business card'}
        </button>
      )}
      {details && (
        <form onSubmit={(event) => void save(event)} className="surface flex flex-col gap-3 p-4" aria-label="Check the business card">
          <p className="text-sm font-semibold">Check what was read, then save.</p>
          {(
            [
              ['card-name', 'Name', 'name', 'text', MEMORY_LIMITS.name],
              ['card-phone', 'Phone', 'phone', 'tel', MEMORY_LIMITS.phone],
              ['card-email', 'Email', 'email', 'email', MEMORY_LIMITS.email],
              ['card-who', 'Who they are', 'relationship', 'text', MEMORY_LIMITS.relationship],
            ] as const
          ).map(([id, label, key, type, max]) => (
            <div key={id}>
              <label htmlFor={id} className="mb-1 block text-sm font-semibold">
                {label}
              </label>
              <input id={id} type={type} className="field" maxLength={max} value={details[key]} onChange={(e) => set(key)(e.target.value)} />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Save customer
            </button>
            <button type="button" onClick={() => setDetails(null)} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
