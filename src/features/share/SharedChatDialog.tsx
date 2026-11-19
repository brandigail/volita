import { createPortal } from 'react-dom'
import { saveDraft } from '../../lib/drafts-api'
import type { GeneratedDraft } from '../../types/draft'
import { CatchUpCard } from '../catchup/CatchUpCard'

interface SharedChatDialogProps {
  /** Screenshots another app shared in, already shrunk. */
  images: string[]
  onClose: () => void
  /** Called after the reply draft is saved, so the app can open History. */
  onSaved: () => void
  onSeePlans: () => void
}

/** Chat screenshots shared into Volita from the phone's share sheet: read them, then write the reply. */
export function SharedChatDialog({ images, onClose, onSaved, onSeePlans }: SharedChatDialogProps) {
  const save = async (draft: GeneratedDraft, transcript: string) => {
    const now = new Date().toISOString()
    await saveDraft({ id: crypto.randomUUID(), ...draft, transcript, createdAt: now, updatedAt: now })
    onSaved()
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Catch up on a chat">
      <div className="w-full max-w-md">
        <CatchUpCard initialImages={images} onDraft={(draft, transcript) => void save(draft, transcript)} onSeePlans={() => { onClose(); onSeePlans() }} />
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
