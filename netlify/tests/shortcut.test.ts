import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TERMS_VERSION } from '../../src/lib/terms.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** The iPhone Shortcut's access code against the real database with a throwaway person; the chat reader is mocked. */

const hoisted = vi.hoisted(() => ({ cookieUser: null as SessionUser | null }))
vi.mock('../functions/_lib/chat-reader.ts', () => ({
  readChat: async () => ({
    ok: true,
    catchUp: { contact: 'Mrs Naidoo', summary: 'She wants a price.', messages: [], needsReply: true, asked: ['a price'] },
  }),
}))
vi.mock('../functions/_lib/auth.ts', () => ({
  auth: { api: { getSession: async () => (hoisted.cookieUser ? { user: { ...hoisted.cookieUser, birthDate: '1990-01-01', termsVersion: TERMS_VERSION } } : null) } },
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip
const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

suite('iPhone Shortcut access code', () => {
  let tokenFn: (req: Request) => Promise<Response>
  let readChatFn: (req: Request) => Promise<Response>
  const userId = `shortcuttest-${RUN}`
  const email = `shortcuttest.${RUN}@example.com`
  const profile = { name: 'T', businessName: '', role: '', phone: '', signature: '', calendarUrl: '' }

  const readWith = (token: string | null, body: string | Uint8Array, type: string) =>
    new Request('http://localhost:8888/api/read-chat', { method: 'POST', headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body })
  const makeToken = async () => ((await (await tokenFn(new Request('http://localhost:8888/api/shortcut-token', { method: 'POST' }))).json()) as { token: string }).token

  beforeAll(async () => {
    // The reader is mocked, but the function still checks that a key is configured.
    process.env.GROQ_API_KEY ??= 'unused'
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified", "birthDate", "termsVersion") VALUES ($1, $2, $3, true, $4, $5)', [userId, 'Shortcut Tester', email, '1990-01-01', TERMS_VERSION])
    tokenFn = (await import('../functions/shortcut-token.ts')).default
    readChatFn = (await import('../functions/read-chat.ts')).default
  })
  afterAll(async () => {
    await sql?.query('DELETE FROM "user" WHERE id = $1', [userId])
  })
  beforeEach(async () => {
    await sql?.query('DELETE FROM api_usage WHERE user_id = $1', [userId])
    hoisted.cookieUser = { id: userId, email, plan: 'pro', planSource: 'default', isOwner: false, profile }
  })

  it('makes a code once, stores only a hash, and reports when it was made', async () => {
    const token = await makeToken()
    expect(token.startsWith('vsk_')).toBe(true)
    const [row] = (await sql?.query('SELECT token_hash FROM shortcut_tokens WHERE user_id = $1', [userId])) as { token_hash: string }[]
    expect(row.token_hash).not.toContain(token)
    const status = (await (await tokenFn(new Request('http://localhost:8888/api/shortcut-token', { method: 'GET' }))).json()) as { exists: boolean }
    expect(status.exists).toBe(true)
  })

  it('reads a screenshot sent as a plain image file with the code, and not without it', async () => {
    const token = await makeToken()
    hoisted.cookieUser = null // the Shortcut has no sign-in cookie
    const ok = await readChatFn(readWith(token, png, 'image/png'))
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { readout: string }
    expect(body.readout).toContain('Mrs Naidoo')
    expect((await readChatFn(readWith(null, png, 'image/png'))).status).toBe(401)
    expect((await readChatFn(readWith('vsk_wrong', png, 'image/png'))).status).toBe(401)
  })

  it('refuses a file that is not a supported image', async () => {
    const token = await makeToken()
    hoisted.cookieUser = null
    expect((await readChatFn(readWith(token, 'hello', 'text/plain'))).status).toBe(400)
    expect((await readChatFn(readWith(token, png, 'image/gif'))).status).toBe(400)
  })

  it('a new code replaces the old one, and removing it stops it working', async () => {
    const first = await makeToken()
    const second = await makeToken()
    hoisted.cookieUser = null
    expect((await readChatFn(readWith(first, png, 'image/png'))).status).toBe(401)
    expect((await readChatFn(readWith(second, png, 'image/png'))).status).toBe(200)
    hoisted.cookieUser = { id: userId, email, plan: 'pro', planSource: 'default', isOwner: false, profile }
    await tokenFn(new Request('http://localhost:8888/api/shortcut-token', { method: 'DELETE' }))
    hoisted.cookieUser = null
    expect((await readChatFn(readWith(second, png, 'image/png'))).status).toBe(401)
  })

  it('the code cannot be used to make or remove codes', async () => {
    const token = await makeToken()
    hoisted.cookieUser = null
    const attempt = new Request('http://localhost:8888/api/shortcut-token', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    expect((await tokenFn(attempt)).status).toBe(401)
  })

  it('still reads a JSON list of screenshots with the sign-in cookie, as the app does', async () => {
    const body = JSON.stringify({ images: [`data:image/png;base64,${png.toString('base64')}`] })
    expect((await readChatFn(readWith(null, body, 'application/json'))).status).toBe(200)
  })
})
