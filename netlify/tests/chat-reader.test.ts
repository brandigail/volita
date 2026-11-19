import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatAsText, type CatchUp } from '../../src/types/catchup.ts'

/** The chat reader with the model mocked: what it accepts, what it retries, and how the chat is handed on. */

const hoisted = vi.hoisted(() => ({ replies: [] as { ok: boolean; content?: string; status?: number }[], calls: 0 }))
vi.mock('../functions/_lib/groq-chat.ts', () => ({
  chat: async () => {
    const reply = hoisted.replies[Math.min(hoisted.calls++, hoisted.replies.length - 1)]
    return reply.ok ? { ok: true, content: reply.content ?? '', toolCalls: [] } : { ok: false, status: reply.status ?? 502 }
  },
}))

const { parseCatchUp, readChat } = await import('../functions/_lib/chat-reader.ts')

const valid = {
  contact: 'Mrs Naidoo',
  summary: 'She wants a price to tile her bathroom and asks when you can start.',
  messages: [
    { sender: 'Mrs Naidoo', mine: false, text: 'Hi, how much to tile a small bathroom?', time: '09:12' },
    { sender: 'Me', mine: true, text: 'Can you send a photo?', time: '09:20' },
    { sender: 'Mrs Naidoo', mine: false, text: '[photo]', time: '09:31' },
  ],
  needsReply: true,
  asked: ['a price to tile a bathroom', 'a start date'],
}
const request = { apiKey: 'k', images: ['data:image/jpeg;base64,AAAA'], deadlineMs: 9_000 }

beforeEach(() => {
  hoisted.replies = []
  hoisted.calls = 0
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('parseCatchUp', () => {
  it('accepts the expected shape and fills in a missing time', () => {
    const parsed = parseCatchUp(JSON.stringify({ ...valid, messages: [{ sender: 'A', mine: false, text: 'hi' }] }))
    expect(parsed.ok && parsed.catchUp.messages[0].time).toBe('')
  })

  it('takes the JSON out of a code fence', () => {
    expect(parseCatchUp('```json\n' + JSON.stringify(valid) + '\n```').ok).toBe(true)
  })

  it('refuses text that is not JSON and JSON that is missing the summary', () => {
    expect(parseCatchUp('Sorry, I cannot read that.').ok).toBe(false)
    expect(parseCatchUp(JSON.stringify({ ...valid, summary: '' })).ok).toBe(false)
  })
})

describe('readChat', () => {
  it('returns the reading when the first answer is valid', async () => {
    hoisted.replies = [{ ok: true, content: JSON.stringify(valid) }]
    const result = await readChat(request)
    expect(result.ok && result.catchUp.contact).toBe('Mrs Naidoo')
    expect(hoisted.calls).toBe(1)
  })

  it('asks again once when the first answer is not usable', async () => {
    hoisted.replies = [{ ok: true, content: 'not json' }, { ok: true, content: JSON.stringify(valid) }]
    const result = await readChat(request)
    expect(result.ok).toBe(true)
    expect(hoisted.calls).toBe(2)
  })

  it('gives up with a clear message after two unusable answers', async () => {
    hoisted.replies = [{ ok: true, content: 'not json' }]
    const result = await readChat(request)
    expect(result.ok).toBe(false)
    expect(hoisted.calls).toBe(2)
  })

  it('passes a busy model on as 429 and other failures as 502', async () => {
    hoisted.replies = [{ ok: false, status: 429 }]
    expect(await readChat(request)).toMatchObject({ ok: false, status: 429 })
    hoisted.calls = 0
    hoisted.replies = [{ ok: false, status: 500 }]
    expect(await readChat(request)).toMatchObject({ ok: false, status: 502 })
  })
})

describe('chatAsText', () => {
  it('labels each side and names the contact', () => {
    const text = chatAsText(valid as CatchUp)
    expect(text).toContain('Chat with Mrs Naidoo:')
    expect(text).toContain('Me: Can you send a photo?')
    expect(text).toContain('Mrs Naidoo: Hi, how much to tile a small bathroom?')
  })

  it('keeps the newest messages when the chat is too long for the draft writer', () => {
    const long: CatchUp = { ...valid, messages: Array.from({ length: 60 }, (_, i) => ({ sender: 'X', mine: false, text: `${i} ${'a'.repeat(1_900)}`, time: '' })) }
    const text = chatAsText(long)
    expect(text.length).toBeLessThan(7_000)
    expect(text).toContain('59 aaa')
    expect(text).not.toContain('\nX: 0 aaa')
  })
})
