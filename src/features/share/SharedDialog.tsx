import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { UpgradeNote } from '../../components/UpgradeNote'
import { ApiRequestError, generateDraft, transcribeAudio } from '../../lib/api'
import { CHANNELS } from '../../lib/channels'
import { saveDraft } from '../../lib/drafts-api'
import { usePlan } from '../../providers/usePlan'
import type { DraftCategory } from '../../types/draft'
import { effectiveSpoken, effectiveWrite } from '../language/languageSettings'
import type { SharedItem } from './useSharedContent'

interface SharedDialogProps {
  shared: SharedItem
  onClose: () => void
  /** Called after the draft is saved, so the app can open History. */
  onSaved: () => void
  onSeePlans: () => void
}

function blobFromBase64(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

/** Turns something shared into Volita (a customer's message, or a WhatsApp voice note) into a draft reply. */
export function SharedDialog({ shared, onClose, onSaved, onSeePlans }: SharedDialogProps) {
  const { limits } = usePlan()
  const [text, setText] = useState(shared.kind === 'text' ? shared.text : '')
  const [category, setCategory] = useState<DraftCategory>('WHATSAPP')
  const [busy, setBusy] = useState(shared.kind === 'audio')
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState(false)
  const channels = CHANNELS.filter((channel) => limits.channels.includes(channel.id))

  // A shared voice note is turned into text first, so it can be checked before a draft is written from it.
  useEffect(() => {
    if (shared.kind !== 'audio') return
    let cancelled = false
    transcribeAudio(blobFromBase64(shared.base64, shared.mimeType), shared.mimeType, false, effectiveSpoken(limits.anyLanguage))
      .then((heard) => !cancelled && setText(heard))
      .catch((err: unknown) => !cancelled && setError(err instanceof ApiRequestError ? err.message : 'Could not listen to that voice note.'))
      .finally(() => !cancelled && setBusy(false))
    return () => {
      cancelled = true
    }
  }, [shared, limits.anyLanguage])

  const write = async () => {
    setBusy(true)
    setError(null)
    try {
      const instruction = `Write a reply to this message I received:\n${text}`
      const draft = await generateDraft(instruction, category, effectiveWrite(limits.anyLanguage), effectiveSpoken(limits.anyLanguage))
      const now = new Date().toISOString()
      await saveDraft({ id: crypto.randomUUID(), ...draft, transcript: text, createdAt: now, updatedAt: now })
      onSaved()
    } catch (err) {
      setUpgrade(err instanceof ApiRequestError && err.upgrade !== undefined)
      setError(err instanceof ApiRequestError ? err.message : 'Could not write that. Please try again.')
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="shared-title">
      <div className="surface w-full max-w-md p-6">
        <h2 id="shared-title" className="text-xl font-extrabold tracking-tight">
          Reply to this
        </h2>
        <p className="muted mt-1 text-sm">{shared.kind === 'audio' ? 'Here is what the voice note says. Fix anything, then pick where your reply goes.' : 'Edit the message if you like, then pick where your reply goes.'}</p>
        <label htmlFor="shared-text" className="sr-only">
          Message
        </label>
        <textarea id="shared-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} disabled={busy && shared.kind === 'audio'} className="field mt-3 resize-y" placeholder={busy ? 'Listening to the voice note…' : ''} />
        <label htmlFor="shared-channel" className="mt-3 mb-1.5 block text-sm font-semibold">
          Reply by
        </label>
        <select id="shared-channel" value={category} onChange={(e) => setCategory(e.target.value as DraftCategory)} className="field">
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.label}
            </option>
          ))}
        </select>
        {error && (
          <div className="mt-3">
            {upgrade ? <UpgradeNote message={error} needs="basic" onSeePlans={() => { onClose(); onSeePlans() }} /> : <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={() => void write()} disabled={busy || !text.trim()} className="btn btn-primary">
            {busy ? 'Working…' : 'Write my reply'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
