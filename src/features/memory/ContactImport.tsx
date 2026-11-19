import { FileUp, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { markDuplicates, parseContactFile, MAX_IMPORT, type ImportCandidate, type ImportedContact } from '../../lib/contact-import'
import { importContacts, type ImportSummary } from '../../lib/memory-api'

/** A contacts file bigger than this is not an address book. */
const MAX_FILE_BYTES = 5_000_000

interface ContactImportProps {
  /** Who is already saved, so they can be left unticked. */
  existing: readonly ImportedContact[]
  /** Called after contacts were saved, so the list reloads. */
  onImported: () => void
}

/**
 * Brings in people from the phone's address book so nobody re-types old customers. The person exports a file (.vcf or .csv), picks it
 * here, ticks who to bring in, and only the name, number and email of those are sent. Nothing is read from the phone without them choosing the file.
 */
export function ContactImport({ existing, onImported }: ContactImportProps) {
  const input = useRef<HTMLInputElement>(null)
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null)
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setMessage(null)
    if (file.size > MAX_FILE_BYTES) return setError('That file is too big to be an address book.')
    const found = markDuplicates(existing, parseContactFile(file.name, await file.text()))
    if (found.length === 0) return setError('No contacts with a name and a number or email were found in that file. Export your contacts as .vcf or .csv and try again.')
    setCandidates(found)
    setTicked(new Set(found.flatMap((contact, index) => (contact.duplicate ? [] : [index]))))
  }
  const toggle = (index: number) =>
    setTicked((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })

  const send = async () => {
    if (!candidates) return
    setBusy(true)
    setError(null)
    try {
      const chosen = candidates.filter((_, index) => ticked.has(index)).map(({ name, phone, email }) => ({ name, phone, email }))
      const result: ImportSummary = await importContacts(chosen)
      setMessage(`${result.added} ${result.added === 1 ? 'person' : 'people'} added${result.skippedNoRoom > 0 ? `. ${result.skippedNoRoom} did not fit on your plan.` : '.'}`)
      setCandidates(null)
      onImported()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not import. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <input ref={input} type="file" accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv,text/plain" hidden onChange={(e) => void choose(e.target.files?.[0])} />
      {!candidates && (
        <>
          <button type="button" onClick={() => input.current?.click()} className="btn btn-ghost cursor-pointer">
            <FileUp className="size-4" aria-hidden="true" />
            Import from my contacts file
          </button>
          <details className="mt-2 text-sm">
            <summary className="muted cursor-pointer">How do I get the file?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Android: Contacts app, Settings, Export, save as .vcf, then pick it here.</li>
              <li>iPhone: on icloud.com open Contacts, select all, then Export vCard. Or share a single contact from the Contacts app.</li>
              <li>Google Contacts (contacts.google.com): Export, “Google CSV”. Outlook: Export to a .csv file.</li>
            </ul>
            <p className="muted mt-2 text-xs">Only each person’s name, number and email are brought in, and only the ones you tick. They are stored scrambled like everything else here.</p>
          </details>
        </>
      )}

      {candidates && (
        <div className="rounded-xl border border-(--line) p-3" aria-label="Choose who to bring in">
          <p className="text-sm font-semibold">
            {candidates.length} found{candidates.length >= MAX_IMPORT ? ` (the first ${MAX_IMPORT})` : ''}. Untick anyone you do not want, such as family and friends.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-ghost cursor-pointer px-3 py-1.5 text-xs" onClick={() => setTicked(new Set(candidates.flatMap((contact, index) => (contact.duplicate ? [] : [index]))))}>
              Tick all new
            </button>
            <button type="button" className="btn btn-ghost cursor-pointer px-3 py-1.5 text-xs" onClick={() => setTicked(new Set())}>
              Untick all
            </button>
          </div>
          <ul className="mt-2 max-h-72 divide-y divide-(--line) overflow-y-auto">
            {candidates.map((contact, index) => (
              <li key={`${contact.name}-${index}`}>
                <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input type="checkbox" className="size-5 accent-orange-600" checked={ticked.has(index)} onChange={() => toggle(index)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{contact.name}</span>
                    <span className="muted block truncate text-xs">{[contact.phone, contact.email].filter(Boolean).join(' · ')}</span>
                  </span>
                  {contact.duplicate && <span className="muted shrink-0 text-xs">Already saved</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void send()} disabled={busy || ticked.size === 0} className="btn btn-primary cursor-pointer">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Import {ticked.size} {ticked.size === 1 ? 'person' : 'people'}
            </button>
            <button type="button" onClick={() => setCandidates(null)} className="btn btn-ghost cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
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
