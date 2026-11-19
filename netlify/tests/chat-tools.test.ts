import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantChat } from '../../src/types/assistant.ts'
import type { ToolContext } from '../functions/_lib/assistant-tools.ts'

/** The assistant's catch_up and reply_to tools with the database, the draft writer and the mailbox mocked. */

const hoisted = vi.hoisted(() => ({
  contacts: [] as { name: string; phone: string; email: string }[],
  saved: [] as { category: string; instruction: string; recipient?: string }[],
  unread: { emails: [] as unknown[], note: undefined as string | undefined },
}))
vi.mock('../functions/_lib/memory-store.ts', () => ({ listContacts: async () => hoisted.contacts }))
vi.mock('../functions/_lib/draft-saver.ts', () => ({
  writeAndSaveDraft: async (_ctx: unknown, input: { category: string; instruction: string; recipient?: string }) => {
    hoisted.saved.push(input)
    return {
      ok: true,
      id: '11111111-1111-4111-8111-111111111111',
      draft: { category: 'WHATSAPP', recipient: input.recipient ?? '', subject: '', body: 'Hi Mrs Naidoo, I can start on Monday.\n\nBrandon', language: 'en' },
    }
  },
}))
vi.mock('../functions/_lib/email-tools.ts', () => ({ recentUnreadEmail: async () => hoisted.unread }))

const { runChatTool } = await import('../functions/_lib/chat-tools.ts')

const chat: AssistantChat = {
  contact: 'Mrs Naidoo',
  summary: 'She wants a price to tile her bathroom.',
  needsReply: true,
  asked: ['a price', 'a start date'],
  messages: [{ sender: 'Mrs Naidoo', mine: false, text: 'How much to tile a small bathroom?' }],
}

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 'u1',
    plan: 'pro',
    profile: { name: 'Brandon', businessName: '', role: '', phone: '', signature: 'Brandon', calendarUrl: '', nickname: '', businessAbout: '' },
    timeZone: 'Africa/Johannesburg',
    apiKey: 'unused',
    deadlineAt: Date.now() + 9_000,
    actions: [],
    emailRead: false,
    userText: '',
    chats: [],
    driving: false,
    inboxTitles: [],
    ...overrides,
  }
}

beforeEach(() => {
  hoisted.contacts = []
  hoisted.saved = []
  hoisted.unread = { emails: [], note: undefined }
})

describe('catch_up', () => {
  it('returns the chats that were added, marked as other people\'s words', async () => {
    const result = JSON.parse((await runChatTool('catch_up', {}, context({ chats: [chat] }))) ?? '{}')
    expect(result.notice).toContain('written by other people')
    expect(result.chats).toEqual([{ contact: 'Mrs Naidoo', waitingForReply: true, summary: chat.summary, asking: chat.asked }])
  })

  it('adds the unread emails on a plan with email, and says why not on one without', async () => {
    hoisted.unread = { emails: [{ from: 'Jan', subject: 'Quote?' }], note: undefined }
    const pro = JSON.parse((await runChatTool('catch_up', {}, context({ chats: [chat] }))) ?? '{}')
    expect(pro.emails).toHaveLength(1)
    const basic = JSON.parse((await runChatTool('catch_up', {}, context({ plan: 'basic', chats: [chat] }))) ?? '{}')
    expect(basic.emails).toHaveLength(0)
    expect(basic.notes.join(' ')).toContain('Pro plan')
  })

  it('tells the assistant what to say when there is nothing to catch up on', async () => {
    const result = JSON.parse((await runChatTool('catch_up', {}, context({ chats: [] }))) ?? '{}')
    expect(result.notes.join(' ')).toContain('add screenshots')
  })
})

describe('reply_to', () => {
  it('writes a WhatsApp draft to a saved person with their number made international, and puts it on the screen', async () => {
    hoisted.contacts = [{ name: 'Mrs Naidoo', phone: '082 123 4567', email: '' }]
    const ctx = context({ chats: [chat] })
    const result = JSON.parse((await runChatTool('reply_to', { contact: 'Naidoo', message: 'say I can start Monday' }, ctx)) ?? '{}')
    expect(result).toEqual({ prepared: true, to: 'Mrs Naidoo', knowsNumber: true })
    expect(hoisted.saved[0].recipient).toBe('+27821234567')
    expect(hoisted.saved[0].category).toBe('WHATSAPP')
    expect(hoisted.saved[0].instruction).toContain('How much to tile a small bathroom?')
    expect(ctx.actions).toEqual([{ type: 'reply_ready', id: '11111111-1111-4111-8111-111111111111', label: 'WhatsApp to Mrs Naidoo' }])
    // The sign-off is not read aloud, and the reader is told how to send.
    expect(ctx.directReply).toContain('I can start on Monday')
    expect(ctx.directReply).not.toContain('Brandon')
    expect(ctx.directReply).toContain('send it')
  })

  it('works for someone only seen in a chat: no number, so WhatsApp will ask who to send it to', async () => {
    const ctx = context({ chats: [chat] })
    const result = JSON.parse((await runChatTool('reply_to', { contact: 'Mrs Naidoo', message: 'say hi' }, ctx)) ?? '{}')
    expect(result.knowsNumber).toBe(false)
    expect(hoisted.saved[0].recipient).toBe('Mrs Naidoo')
  })

  it('asks which one when two saved people match', async () => {
    hoisted.contacts = [
      { name: 'Sipho Dlamini', phone: '', email: '' },
      { name: 'Sipho Khumalo', phone: '', email: '' },
    ]
    const result = JSON.parse((await runChatTool('reply_to', { contact: 'Sipho', message: 'on my way' }, context())) ?? '{}')
    expect(result.error).toContain('Sipho Dlamini, Sipho Khumalo')
    expect(hoisted.saved).toHaveLength(0)
  })

  it('leaves a chat that holds card details out of what the draft writer sees', async () => {
    const risky: AssistantChat = { ...chat, messages: [{ sender: 'Mrs Naidoo', mine: false, text: 'my card is 4111 1111 1111 1111' }] }
    await runChatTool('reply_to', { contact: 'Mrs Naidoo', message: 'thanks' }, context({ chats: [risky] }))
    expect(hoisted.saved[0].instruction).not.toContain('4111')
  })

  it('does not send anything: there is no tool or action that does', async () => {
    const ctx = context()
    await runChatTool('reply_to', { contact: 'Mrs Naidoo', message: 'hello' }, ctx)
    expect(ctx.actions.every((a) => a.type === 'reply_ready')).toBe(true)
    expect(await runChatTool('send_whatsapp', {}, ctx)).toBeNull()
  })
})

describe('catch_up with chats read from the phone', () => {
  it('hands over the messages to be summarised when a chat has no summary yet', async () => {
    const fromPhone: AssistantChat = {
      contact: 'Abigail Smith',
      summary: '',
      needsReply: true,
      asked: [],
      messages: [
        { sender: 'Abigail Smith', mine: false, text: 'Are you coming?' },
        { sender: 'Abigail Smith', mine: false, text: 'Hello??' },
      ],
    }
    const result = JSON.parse((await runChatTool('catch_up', {}, context({ chats: [fromPhone] }))) ?? '{}')
    expect(result.chats[0].messages).toEqual(['Abigail Smith: Are you coming?', 'Abigail Smith: Hello??'])
    expect(result.chats[0].summary).toContain('summarise')
    expect(result.chats[0].asking).toBeUndefined()
  })
})

describe('catch_up when the person named someone with no chat', () => {
  it('lists the chats on the phone and tells the assistant to ask which one, not to guess', async () => {
    const result = JSON.parse((await runChatTool('catch_up', {}, context({ inboxTitles: ['Squishmellow', 'Sipho Dlamini'] }))) ?? '{}')
    expect(result.otherChatsOnPhone).toEqual(['Squishmellow', 'Sipho Dlamini'])
    expect(result.notes.join(' ')).toContain('ask which one')
  })
})
