import { AlertCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { UpgradeNote } from '../../components/UpgradeNote'
import { ApiRequestError } from '../../lib/api'
import { learnStyle } from '../../lib/plan-api'
import { usePlan } from '../../providers/usePlan'
import { ContactsList } from './ContactsList'
import { NotesList } from './NotesList'
import { useMemory } from './useMemory'

/** Everything Volita has been told to remember, in one place the person can read, correct and delete. */
export function MemorySection() {
  const { memories, contacts, error, addNote, editNote, removeNote, saveContact, removeContact } = useMemory()
  const { limits } = usePlan()
  const [styleNote, setStyleNote] = useState<string | null>(null)
  const [learning, setLearning] = useState(false)
  const seePlans = () => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })
  const locked = limits.memoryItems === 0

  const learn = async () => {
    setLearning(true)
    try {
      setStyleNote((await learnStyle()).message)
    } catch (err) {
      setStyleNote(err instanceof ApiRequestError ? err.message : 'Could not study your drafts right now.')
    } finally {
      setLearning(false)
    }
  }

  return (
    <section aria-labelledby="memory-heading" className="mt-10">
      <h2 id="memory-heading" className="text-2xl font-extrabold tracking-tight">
        What Volita knows about you
      </h2>
      <p className="muted mt-1 text-sm">
        Tell the assistant things once and it keeps them: how you like your messages written, your prices, the people you deal with. Drafts and answers use this
        automatically. It is stored encrypted, only you can see it, and you can change or delete any of it here.
      </p>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {locked && (
        <div className="mt-4">
          <UpgradeNote message="Remembering notes and people is part of the Basic plan. Anything already saved is kept and can still be read or deleted." needs="basic" onSeePlans={seePlans} />
        </div>
      )}
      {!locked && limits.memoryItems !== null && memories && (
        <p className="muted mt-3 text-xs">
          {memories.length} of {limits.memoryItems} notes and {contacts.length} of {limits.contacts} people used on your plan.
        </p>
      )}
      {limits.writingStyle ? (
        <div className="mt-3">
          <button type="button" onClick={() => void learn()} disabled={learning} className="btn btn-ghost">
            <Sparkles className="size-4" aria-hidden="true" />
            {learning ? 'Studying your drafts…' : 'Learn my writing style'}
          </button>
          {styleNote && (
            <p role="status" className="muted mt-2 text-sm">
              {styleNote}
            </p>
          )}
        </div>
      ) : (
        <p className="muted mt-3 text-xs">Pro learns your writing style from the drafts you edit before sending.</p>
      )}

      {memories === null && !error && (
        <p role="status" className="muted mt-4">
          Loading…
        </p>
      )}

      {memories && (
        <div className="surface mt-4 flex flex-col gap-6 p-5">
          <div>
            <h3 className="mb-2 text-sm font-bold">Notes</h3>
            <NotesList memories={memories} onAdd={addNote} onEdit={editNote} onRemove={removeNote} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold">People</h3>
            <ContactsList contacts={contacts} onSave={saveContact} onRemove={removeContact} />
          </div>
        </div>
      )}
    </section>
  )
}
