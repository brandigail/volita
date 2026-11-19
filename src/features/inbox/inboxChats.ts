import { nativeInbox, type InboxMessage } from '../../lib/native-inbox'
import type { AssistantChat } from '../../types/assistant'
import { chatsNamedIn, wantsCatchUp } from './match'

/** How far back a named chat is looked for, and how far back "catch me up" looks when no one is named. */
const NAMED_HOURS = 72
const GENERAL_HOURS = 24
/** Most chats a general catch-up reads, and most messages and characters kept per chat. Kept small: every word is read by the assistant. */
const GENERAL_CHATS = 3
const MESSAGES_PER_CHAT = 12
const TEXT_CHARS = 240

function toChat(contact: string, messages: InboxMessage[]): AssistantChat {
  return {
    contact,
    summary: '',
    // The copy holds what people sent, so the last message is theirs and is waiting for an answer.
    needsReply: messages.length > 0,
    asked: [],
    messages: messages.slice(-MESSAGES_PER_CHAT).map((message) => ({ sender: message.sender, mine: false, text: message.text.slice(0, TEXT_CHARS) })),
  }
}

/**
 * The WhatsApp chats the person's words are about, read from the copy kept on this phone: the chat of anyone they name
 * ("catch me up with Abigail"), or the newest few chats when they ask about their messages in general. Nothing is read
 * unless their words ask for it, and the messages go no further than the one request that needs them.
 */
export async function inboxChatsFor(utterance: string): Promise<AssistantChat[]> {
  if (!nativeInbox.available) return []
  const status = await nativeInbox.status()
  if (!status?.enabled) return []

  const named = chatsNamedIn(utterance, await nativeInbox.chats(NAMED_HOURS))
  const wanted = named.length > 0 ? named.slice(0, GENERAL_CHATS) : wantsCatchUp(utterance) ? (await nativeInbox.chats(GENERAL_HOURS)).slice(0, GENERAL_CHATS) : []

  const chats: AssistantChat[] = []
  for (const info of wanted) {
    const messages = await nativeInbox.read(info.chat, MESSAGES_PER_CHAT)
    if (messages.length > 0) chats.push(toChat(info.chat, messages))
  }
  return chats
}

/** Adds newly read chats to those already in use, replacing a chat read again, newest first, up to `max`. */
export function mergeChats(existing: AssistantChat[], fresh: AssistantChat[], max: number): AssistantChat[] {
  const seen = new Set(fresh.map((chat) => chat.contact.trim().toLowerCase()))
  return [...fresh, ...existing.filter((chat) => !seen.has(chat.contact.trim().toLowerCase()))].slice(0, max)
}
