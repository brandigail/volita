import { useSyncExternalStore } from 'react'
import type { CatchUp } from '../../types/catchup'
import { ASSISTANT_CHAT_MESSAGES, MAX_ASSISTANT_CHATS, MAX_ASSISTANT_CHAT_TEXT, type AssistantChat } from '../../types/assistant'

/**
 * The chats Volita has read from screenshots on this device, kept in memory only. They hold other people's words, so
 * they are never written to storage and they disappear when the page is closed. The assistant gets them with each turn
 * so "catch me up" and "reply to Mrs Naidoo" know what was said.
 */
let chats: readonly CatchUp[] = []
const listeners = new Set<() => void>()

function publish(next: readonly CatchUp[]): void {
  chats = next
  listeners.forEach((listener) => listener())
}

/** Adds a chat, newest first. Reading the same contact again replaces the older reading instead of piling up. */
export function addChat(chat: CatchUp): void {
  const contact = chat.contact.trim().toLowerCase()
  const others = chats.filter((existing) => !contact || existing.contact.trim().toLowerCase() !== contact)
  publish([chat, ...others].slice(0, MAX_ASSISTANT_CHATS))
}

export function clearChats(): void {
  publish([])
}

export function removeChat(index: number): void {
  publish(chats.filter((_, i) => i !== index))
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The chats read so far, re-rendering when one is added or removed. */
export function useChats(): readonly CatchUp[] {
  return useSyncExternalStore(subscribe, () => chats)
}

/** The chats trimmed to what the assistant needs: the summary, what was asked, and the newest messages. */
export function chatsForAssistant(): AssistantChat[] {
  return chats.map((chat) => ({
    contact: chat.contact,
    summary: chat.summary,
    needsReply: chat.needsReply,
    asked: chat.asked,
    messages: chat.messages.slice(-ASSISTANT_CHAT_MESSAGES).map((message) => ({
      sender: message.sender,
      mine: message.mine,
      text: message.text.slice(0, MAX_ASSISTANT_CHAT_TEXT),
    })),
  }))
}
