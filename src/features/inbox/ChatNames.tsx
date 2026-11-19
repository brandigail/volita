import { useEffect, useState } from 'react'
import { nativeInbox, type InboxChatInfo } from '../../lib/native-inbox'
import { parseNames, readAliases, setAliases, type ChatAliases } from './aliases'

/** Chats from the last week, as the phone has them. */
const HOURS = 24 * 7

/**
 * Tells Volita who each WhatsApp chat is. WhatsApp shows a chat under the name saved in the phone's contacts, which may be a
 * nickname, so "Abigail" would match nothing; here the person says "this chat is Abigail, my wife" once. The parent gives it a
 * new `key` when the saved messages change, which reloads the list.
 */
export function ChatNames() {
  const [chats, setChats] = useState<InboxChatInfo[]>([])
  const [aliases, setSaved] = useState<ChatAliases>(() => readAliases())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [justSaved, setJustSaved] = useState<string | null>(null)

  useEffect(() => {
    void nativeInbox.chats(HOURS).then(setChats)
  }, [])

  if (chats.length === 0) {
    return <p className="muted mt-3 text-xs">Chats appear here once a WhatsApp message has reached this phone. Then you can say who each one is.</p>
  }

  const save = (chat: string) => {
    const names = parseNames(drafts[chat] ?? (aliases[chat] ?? []).join(', '))
    setSaved(setAliases(chat, names))
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== chat)))
    setJustSaved(chat)
  }

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">Who are these chats?</h3>
      <p className="muted mt-1 text-xs">WhatsApp shows a chat under the name saved in your contacts, which can be a nickname. Say who it is, and “catch me up with Abigail” will find it. Separate names with commas.</p>
      <ul className="mt-2 space-y-3">
        {chats.map((info) => {
          const value = drafts[info.chat] ?? (aliases[info.chat] ?? []).join(', ')
          const inputId = `chat-names-${chats.indexOf(info)}`
          return (
            <li key={info.chat}>
              <label htmlFor={inputId} className="block text-sm font-semibold break-words">
                {info.chat} <span className="muted font-normal">· {info.count} message{info.count === 1 ? '' : 's'}</span>
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id={inputId}
                  className="field"
                  value={value}
                  maxLength={80}
                  placeholder="For example: Abigail, my wife"
                  onChange={(e) => setDrafts((current) => ({ ...current, [info.chat]: e.target.value }))}
                />
                <button type="button" onClick={() => save(info.chat)} className="btn btn-ghost shrink-0">
                  Save
                </button>
              </div>
              {justSaved === info.chat && <p role="status" className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Saved.</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
