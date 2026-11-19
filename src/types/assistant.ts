import type { DraftCategory } from './draft.ts'

/** A chat read from screenshots, trimmed, that the app hands the assistant so it can catch the user up or reply. */
export interface AssistantChat {
  contact: string
  summary: string
  needsReply: boolean
  asked: string[]
  messages: { sender: string; mine: boolean; text: string }[]
}

export const MAX_ASSISTANT_CHATS = 3
/** Newest messages kept per chat, and the longest text kept per message. */
export const ASSISTANT_CHAT_MESSAGES = 20
export const MAX_ASSISTANT_CHAT_TEXT = 400

export interface AssistantTurn {
  role: 'user' | 'assistant'
  content: string
  /** What the assistant did when it said this, sent back so it still knows the id of a draft it just wrote. */
  actions?: AssistantAction[]
}

export interface AssistantRequest {
  /** The latest turns, oldest first, ending with what the user just said. Tool results are never sent by the client. */
  messages: AssistantTurn[]
  /** IANA zone such as "Africa/Johannesburg", so "tomorrow at ten" means the user's tomorrow. */
  timeZone: string
  /** Groups the turns of one conversation so they can be listed together in the history. */
  conversationId: string
  /** The language being spoken, or "auto", so recognition is more accurate. */
  spokenLanguage?: string
  /** Chats the user added as screenshots on this device (never stored by the server). */
  chats?: AssistantChat[]
  /** When the person named someone who matched no WhatsApp chat on their phone: the names of their recent chats, so the assistant can ask which one. */
  inboxTitles?: string[]
  /** True when the app read chats from the phone for this turn, so the assistant can answer with one small call. */
  catchUp?: boolean
  /** True in driving mode: replies are only heard, so the assistant keeps them short and confirms every send. */
  driving?: boolean
  /** True in the Android app, the only place Volita can read WhatsApp messages by itself. Anywhere else the assistant says so plainly. */
  inboxAvailable?: boolean
}

/** Things the assistant did on the user's behalf this turn, so the screen can show them. */
export type AssistantAction =
  | { type: 'draft_created'; id: string; category: DraftCategory; label: string }
  | { type: 'agenda_added'; id: string; label: string }
  | { type: 'marked_sent'; id: string; label: string }
  | { type: 'send_scheduled'; id: string; label: string }
  | { type: 'memory_saved'; id: string; label: string }
  | { type: 'contact_saved'; id: string; label: string }
  | { type: 'memory_forgotten'; id: string; label: string }
  /** An email written for the user to approve; `id` is the waiting email. Only the user can send it. */
  | { type: 'email_ready'; id: string; label: string }
  /** A reply written for the user to approve; uid=197609(brand) gid=197609 groups=197609 is the saved draft. WhatsApp opens only when the user says send it or taps the button. */
  | { type: 'reply_ready'; id: string; label: string }

export interface AssistantResponse {
  reply: string
  actions: AssistantAction[]
  /** Set when the reply reads a draft that is not in English, so it is spoken with a matching voice. */
  speechLanguage?: string
}

/** The voices Groq's Orpheus model offers. */
export const ASSISTANT_VOICES = ['hannah', 'diana', 'autumn', 'austin', 'daniel', 'troy'] as const
export type AssistantVoice = (typeof ASSISTANT_VOICES)[number]

/** What the assistant always asks after writing a draft. The server guarantees the wording; the app plays a recorded clip for it. */
export const READ_BACK_QUESTION = 'Would you like me to read you back your draft?'

/** Most characters of text one speech request may carry (Groq's Orpheus model limit). */
export const MAX_SPEECH_CHARS = 200
