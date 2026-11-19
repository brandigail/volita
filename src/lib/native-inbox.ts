import { registerPlugin } from '@capacitor/core'
import { isAndroidApp } from './native-listening'

export interface InboxMessage {
  chat: string
  sender: string
  text: string
  /** Epoch milliseconds. */
  time: number
}

export interface InboxChatInfo {
  chat: string
  count: number
  lastTime: number
}

export interface InboxStatus {
  /** The person has switched on Notification access for Volita. */
  enabled: boolean
  /** Messages kept on this phone. */
  count: number
  keepDays: number
}

interface VolitaInboxPlugin {
  status: () => Promise<InboxStatus>
  openSettings: () => Promise<void>
  read: (options: { chat: string; limit?: number }) => Promise<{ messages: InboxMessage[] }>
  chats: (options: { hours?: number }) => Promise<{ chats: InboxChatInfo[] }>
  canReply: (options: { chat: string }) => Promise<{ canReply: boolean }>
  sendReply: (options: { chat: string; text: string }) => Promise<{ sent: boolean }>
  clear: () => Promise<void>
}

/** Implemented in android/ (WhatsAppListenerService). It only exists inside the Android app, never in a browser. */
const Native = registerPlugin<VolitaInboxPlugin>('VolitaInbox')

/** The WhatsApp copy on this phone. Every call returns a harmless empty answer outside the Android app or when something fails. */
export const nativeInbox = {
  available: isAndroidApp,

  async status(): Promise<InboxStatus | null> {
    if (!isAndroidApp) return null
    try {
      return await Native.status()
    } catch {
      return null
    }
  },

  async openSettings(): Promise<void> {
    if (isAndroidApp) await Native.openSettings().catch(() => undefined)
  },

  async read(chat: string, limit: number): Promise<InboxMessage[]> {
    if (!isAndroidApp) return []
    try {
      return (await Native.read({ chat, limit })).messages
    } catch {
      return []
    }
  },

  async chats(hours: number): Promise<InboxChatInfo[]> {
    if (!isAndroidApp) return []
    try {
      return (await Native.chats({ hours })).chats
    } catch {
      return []
    }
  },

  async canReply(chat: string): Promise<boolean> {
    if (!isAndroidApp) return false
    try {
      return (await Native.canReply({ chat })).canReply
    } catch {
      return false
    }
  },

  /** Sends through the chat's own Reply button. Call it only after the person said send it or tapped the button. */
  async sendReply(chat: string, text: string): Promise<boolean> {
    if (!isAndroidApp) return false
    try {
      return (await Native.sendReply({ chat, text })).sent
    } catch {
      return false
    }
  },

  async clear(): Promise<void> {
    if (isAndroidApp) await Native.clear().catch(() => undefined)
  },
}
