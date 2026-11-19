import { nativeInbox, type InboxChatInfo, type InboxMessage } from '../../lib/native-inbox'
import type { AssistantChat } from '../../types/assistant'
import { addAlias, chatsAliasedIn, readAliases } from './aliases'
import { asksAboutPerson, chatsNamedIn, guessName, wantsCatchUp } from './match'

/** How far back a named chat is looked for, and how far back "catch me up" looks when no one is named. */
const NAMED_HOURS = 24 * 7
const GENERAL_HOURS = 24
/** Most chats a general catch-up reads, and most messages and characters kept per chat. Kept small: every word is read by the assistant. */
const GENERAL_CHATS = 3
const MESSAGES_PER_CHAT = 12
const TEXT_CHARS = 240
/** How many chat names are offered when the person's name for someone matches nothing. */
const TITLES_OFFERED = 8
/** A name that matched nothing is remembered for this many turns, in case the next words say which chat it is. */
const PENDING_TURNS = 2

export interface InboxReading {
  /** The chats the person's words were about, read from this phone. */
  chats: AssistantChat[]
  /** When they asked about a person who matched no chat: the names of recent chats, so the assistant can ask which one. */
  titles: string[]
}

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

/** The chats to read, and the name that matched nothing (if the person named someone). */
async function choose(utterance: string): Promise<{ infos: InboxChatInfo[]; unmatched: string | null; recent: InboxChatInfo[] }> {
  const recent = await nativeInbox.chats(NAMED_HOURS)
  const aliased = chatsAliasedIn(utterance, readAliases()).map((title) => recent.find((info) => info.chat === title) ?? { chat: title, count: 0, lastTime: 0 })
  const named = chatsNamedIn(utterance, recent).filter((info) => !aliased.some((a) => a.chat === info.chat))
  const infos = [...aliased, ...named].slice(0, GENERAL_CHATS)
  if (infos.length > 0) return { infos, unmatched: null, recent }
  // Someone was named but no chat is called that: do not fall back to a general catch-up, ask which chat they mean.
  const name = asksAboutPerson(utterance) ? guessName(utterance) : null
  if (name) return { infos: [], unmatched: name, recent }
  if (wantsCatchUp(utterance)) {
    const today = recent.filter((info) => info.lastTime >= Date.now() - GENERAL_HOURS * 3_600_000)
    return { infos: today.slice(0, GENERAL_CHATS), unmatched: null, recent }
  }
  return { infos: [], unmatched: null, recent }
}

/** The name that matched no chat on the last turn, with the turns left before it is forgotten. */
let pending: { name: string; turns: number } | null = null

/**
 * The WhatsApp chats the person's words are about, read from the copy kept on this phone: the chat of anyone they name
 * ("catch me up with Abigail"), by the chat's own name or by a name they gave it, or the newest few chats when they ask about
 * their messages in general. If they name someone who matches no chat, the recent chat names are returned so the assistant can ask
 * "which chat is she?"; when their next words name one, that chat is remembered as that person. Nothing is read unless their words
 * ask for it, and the messages go no further than the one request that needs them.
 */
export async function inboxChatsFor(utterance: string): Promise<InboxReading> {
  const none: InboxReading = { chats: [], titles: [] }
  if (!nativeInbox.available) return none
  const status = await nativeInbox.status()
  if (!status?.enabled) return none

  const { infos, unmatched, recent } = await choose(utterance)

  // "Squishmellow" said right after "Abigail" matched nothing: that is Abigail's chat, so remember it.
  if (pending && infos.length === 1 && !chatsAliasedIn(utterance, readAliases()).includes(infos[0].chat)) {
    addAlias(infos[0].chat, pending.name)
    pending = null
  } else if (pending && --pending.turns <= 0) {
    pending = null
  }
  if (unmatched) pending = { name: unmatched, turns: PENDING_TURNS }

  const chats: AssistantChat[] = []
  for (const info of infos) {
    const messages = await nativeInbox.read(info.chat, MESSAGES_PER_CHAT)
    if (messages.length > 0) chats.push(toChat(info.chat, messages))
  }
  return { chats, titles: unmatched ? recent.slice(0, TITLES_OFFERED).map((info) => info.chat) : [] }
}

/** Forgets the name waiting to be matched; called when a conversation ends. */
export function resetInboxConversation(): void {
  pending = null
}

/** Adds newly read chats to those already in use, replacing a chat read again, newest first, up to `max`. */
export function mergeChats(existing: AssistantChat[], fresh: AssistantChat[], max: number): AssistantChat[] {
  const seen = new Set(fresh.map((chat) => chat.contact.trim().toLowerCase()))
  return [...fresh, ...existing.filter((chat) => !seen.has(chat.contact.trim().toLowerCase()))].slice(0, max)
}
