import { Loader2, MessagesSquare, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { ApiRequestError } from '../../lib/api'
import { readChatScreenshots } from '../../lib/catchup-api'
import { shrinkImage } from '../../lib/image'
import { usePlan } from '../../providers/usePlan'
import { MAX_CHAT_IMAGES } from '../../types/catchup'
import { addChat, clearChats, removeChat, useChats } from './chatStore'

/** Screenshots are text, so they are kept sharper than photos; four of them still fit well under the upload limit. */
const MAX_SIDE = 1400
const JPEG_QUALITY = 0.7

/**
 * The chats Volita has read on this device, shown on the assistant screen so the person knows what "catch me up" and "reply to"
 * will use. They live in memory only and disappear when the page is closed.
 */
export function ChatShelf() {
  const { refresh } = usePlan()
  const chats = useChats()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (files: FileList | null) => {
    const picked = Array.from(files ?? []).slice(0, MAX_CHAT_IMAGES)
    if (picked.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const images = await Promise.all(picked.map((file) => shrinkImage(file, MAX_SIDE, JPEG_QUALITY)))
      addChat(await readChatScreenshots(images))
      refresh()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not read those screenshots. Try a clearer one.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="surface w-full max-w-md p-4 text-left">
      <p className="text-sm font-semibold">Chats to catch up on</p>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
      {chats.length === 0 ? (
        <p className="muted mt-1 text-sm">Add screenshots of a WhatsApp chat, then say “catch me up”.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {chats.map((chat, index) => (
            <li key={`${chat.contact}-${index}`} className="flex items-start gap-2 text-sm">
              <span className="flex-1">
                <span className="font-semibold">{chat.contact || 'A chat'}</span>
                {chat.needsReply && <span className="muted"> · waiting for your reply</span>}
              </span>
              <button type="button" onClick={() => removeChat(index)} aria-label={`Remove the chat with ${chat.contact || 'this person'}`} className="rounded-full p-1 hover:bg-black/10 dark:hover:bg-white/10">
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn btn-ghost">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MessagesSquare className="size-4" aria-hidden="true" />}
          {busy ? 'Reading the chat…' : 'Add a chat screenshot'}
        </button>
        {chats.length > 1 && (
          <button type="button" onClick={clearChats} className="btn btn-ghost">
            Clear all
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
