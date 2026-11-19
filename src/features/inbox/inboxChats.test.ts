import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const { inboxChatsFor, mergeChats, resetInboxConversation } = await import('./inboxChats')
const { readAliases, setAliases } = await import('./aliases')

const msg = (chat: string, text: string, time = 1): InboxMessage => ({ chat, sender: chat, text, time })
const NICKNAME = 'Squishmellow 💞💞💞'
const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  })
  resetInboxConversation()
  hoisted.enabled = true
  hoisted.reads = []
  const now = Date.now()
  hoisted.chats = [
    { chat: NICKNAME, count: 4, lastTime: now - 1_000 },
    { chat: 'Sipho Dlamini', count: 1, lastTime: now - 2_000 },
    { chat: 'Mom', count: 1, lastTime: now - 3_000 },
    { chat: 'Jan Botha', count: 1, lastTime: now - 100 * 3_600_000 },
  ]
  hoisted.messages = {
    [NICKNAME]: [msg(NICKNAME, 'Are you coming?'), msg(NICKNAME, 'Hello??')],
    'Sipho Dlamini': [msg('Sipho Dlamini', 'Price for the gate?')],
    Mom: [msg('Mom', 'Call me')],
    'Jan Botha': [msg('Jan Botha', 'Thanks')],
  }
})
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('inboxChatsFor', () => {
  it('reads only the chat of the person named', async () => {
    const { chats, titles } = await inboxChatsFor('what did Sipho say')
    expect(chats.map((c) => c.contact)).toEqual(['Sipho Dlamini'])
    expect(chats[0].needsReply).toBe(true)
    expect(titles).toEqual([])
    expect(hoisted.reads).toEqual(['Sipho Dlamini'])
  })

  it('reads the chat saved under a nickname when the person has said who it is', async () => {
    setAliases(NICKNAME, ['Abigail', 'my wife'])
    const { chats } = await inboxChatsFor('Catch me up with Abigail')
    expect(chats.map((c) => c.contact)).toEqual([NICKNAME])
    expect(chats[0].messages.map((m) => m.text)).toEqual(['Are you coming?', 'Hello??'])
  })

  it('reads the newest few chats from today for a general catch-up', async () => {
    const { chats } = await inboxChatsFor('what did I miss?')
    expect(chats.map((c) => c.contact)).toEqual([NICKNAME, 'Sipho Dlamini', 'Mom'])
  })

  it('offers the recent chat names when a named person matches nothing', async () => {
    const { chats, titles } = await inboxChatsFor('Catch me up with Abigail')
    expect(chats).toEqual([])
    expect(titles).toEqual([NICKNAME, 'Sipho Dlamini', 'Mom', 'Jan Botha'])
  })

  it('remembers who a chat is when the next words name it, so it works by name from then on', async () => {
    await inboxChatsFor('Catch me up with Abigail')
    const second = await inboxChatsFor('Squishmellow')
    expect(second.chats.map((c) => c.contact)).toEqual([NICKNAME])
    expect(readAliases()[NICKNAME]).toEqual(['Abigail'])
    const third = await inboxChatsFor('what did Abigail say')
    expect(third.chats.map((c) => c.contact)).toEqual([NICKNAME])
    expect(third.titles).toEqual([])
  })

  it('does not remember a name for an unrelated chat mentioned much later', async () => {
    await inboxChatsFor('Catch me up with Abigail')
    await inboxChatsFor('add a meeting')
    await inboxChatsFor('add another meeting')
    await inboxChatsFor('Sipho')
    expect(readAliases()).toEqual({})
  })

  it('reads nothing when the words are not about messages', async () => {
    expect(await inboxChatsFor('add a meeting tomorrow at ten')).toEqual({ chats: [], titles: [] })
    expect(hoisted.reads).toEqual([])
  })

  it('reads nothing while the person has not switched on notification access', async () => {
    hoisted.enabled = false
    expect(await inboxChatsFor('catch me up with Sipho')).toEqual({ chats: [], titles: [] })
    expect(hoisted.reads).toEqual([])
  })

  it('cuts long messages and keeps only the newest ones', async () => {
    hoisted.messages['Sipho Dlamini'] = Array.from({ length: 30 }, (_, i) => msg('Sipho Dlamini', `${i} ${'x'.repeat(500)}`))
    const { chats } = await inboxChatsFor('what did Sipho say')
    expect(chats[0].messages).toHaveLength(12)
    expect(chats[0].messages.every((m) => m.text.length <= 240)).toBe(true)
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
