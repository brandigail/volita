import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxChatInfo, InboxMessage } from '../../lib/native-inbox'
import type { AssistantChat } from '../../types/assistant'

const hoisted = vi.hoisted(() => ({
  enabled: true,
  chats: [] as InboxChatInfo[],
  messages: {} as Record<string, InboxMessage[]>,
  reads: [] as string[],
}))

vi.mock('../../lib/native-inbox', () => ({
  nativeInbox: {
    available: true,
    status: async () => ({ enabled: hoisted.enabled, count: 5, keepDays: 7 }),
    chats: async () => hoisted.chats,
    read: async (chat: string) => {
      hoisted.reads.push(chat)
      return hoisted.messages[chat] ?? []
    },
  },
}))

const { inboxChatsFor, mergeChats } = await import('./inboxChats')

const msg = (chat: string, text: string, time = 1): InboxMessage => ({ chat, sender: chat, text, time })

beforeEach(() => {
  hoisted.enabled = true
  hoisted.reads = []
  hoisted.chats = [
    { chat: 'Abigail Smith', count: 3, lastTime: 300 },
    { chat: 'Sipho Dlamini', count: 1, lastTime: 200 },
    { chat: 'Mom', count: 1, lastTime: 100 },
    { chat: 'Jan Botha', count: 1, lastTime: 50 },
  ]
  hoisted.messages = {
    'Abigail Smith': [msg('Abigail Smith', 'Are you coming?'), msg('Abigail Smith', 'Hello??')],
    'Sipho Dlamini': [msg('Sipho Dlamini', 'Price for the gate?')],
    Mom: [msg('Mom', 'Call me')],
    'Jan Botha': [msg('Jan Botha', 'Thanks')],
  }
})

describe('inboxChatsFor', () => {
  it('reads only the chat of the person named', async () => {
    const chats = await inboxChatsFor('Catch me up with Abigail')
    expect(chats.map((c) => c.contact)).toEqual(['Abigail Smith'])
    expect(chats[0].messages.map((m) => m.text)).toEqual(['Are you coming?', 'Hello??'])
    expect(chats[0].needsReply).toBe(true)
    expect(hoisted.reads).toEqual(['Abigail Smith'])
  })

  it('reads the newest few chats for a general catch-up', async () => {
    const chats = await inboxChatsFor('what did I miss?')
    expect(chats.map((c) => c.contact)).toEqual(['Abigail Smith', 'Sipho Dlamini', 'Mom'])
  })

  it('reads nothing when the words are not about messages', async () => {
    expect(await inboxChatsFor('add a meeting tomorrow at ten')).toEqual([])
    expect(hoisted.reads).toEqual([])
  })

  it('reads nothing while the person has not switched on notification access', async () => {
    hoisted.enabled = false
    expect(await inboxChatsFor('catch me up with Abigail')).toEqual([])
    expect(hoisted.reads).toEqual([])
  })

  it('cuts long messages and keeps only the newest ones', async () => {
    hoisted.messages['Abigail Smith'] = Array.from({ length: 30 }, (_, i) => msg('Abigail Smith', `${i} ${'x'.repeat(500)}`))
    const [chat] = await inboxChatsFor('catch me up with Abigail')
    expect(chat.messages).toHaveLength(12)
    expect(chat.messages.every((m) => m.text.length <= 240)).toBe(true)
  })
})

describe('mergeChats', () => {
  const chat = (contact: string, summary = ''): AssistantChat => ({ contact, summary, needsReply: true, asked: [], messages: [] })

  it('puts new chats first, replaces one read again, and caps the list', () => {
    const merged = mergeChats([chat('Abigail', 'old'), chat('Sipho')], [chat('abigail', 'new'), chat('Jan')], 3)
    expect(merged.map((c) => `${c.contact}:${c.summary}`)).toEqual(['abigail:new', 'Jan:', 'Sipho:'])
    expect(mergeChats([chat('A'), chat('B')], [chat('C'), chat('D')], 3)).toHaveLength(3)
  })
})
