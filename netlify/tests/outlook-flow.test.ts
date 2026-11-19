import { neon } from '@neondatabase/serverless'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../functions/_lib/assistant-tools.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/** Outlook through a small fake Microsoft (sign-in and Graph) on this computer, with the real database. */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip

const LONG_ID = `AAMkAGI2${'x'.repeat(120)}==`
const idToken = (email: string) => `e30.${Buffer.from(JSON.stringify({ preferred_username: email })).toString('base64url')}.sig`
const calls: { method: string; path: string; search: string; body: string }[] = []
let refreshCount = 0

async function bodyOf(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

let server: Server
function startFakeMicrosoft(): Promise<string> {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub')
    const body = await bodyOf(req)
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(data === undefined ? '' : JSON.stringify(data))
    }
    if (url.pathname === '/token') {
      const form = new URLSearchParams(body)
      if (form.get('grant_type') === 'authorization_code') {
        if (form.get('code') === 'good') return send(200, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, scope: 'Mail.Read Mail.Send openid email', id_token: idToken('Dad@Outlook.test') })
        if (form.get('code') === 'read-only') return send(200, { access_token: 'at-ro', refresh_token: 'rt-ro', expires_in: 3600, scope: 'Mail.Read openid email', id_token: idToken('dad@outlook.test') })
        return send(400, { error: 'invalid_grant' })
      }
      refreshCount++
      if (form.get('refresh_token') === 'rt-revoked') return send(400, { error: 'invalid_grant' })
      return send(200, { access_token: `at-${refreshCount + 1}`, refresh_token: `rt-${refreshCount + 1}`, expires_in: 3600, scope: 'Mail.Read Mail.Send' })
    }
    const graph = url.pathname.replace(/^\/graph\/v1\.0\/me/, '')
    calls.push({ method: req.method ?? 'GET', path: graph, search: url.search, body })
    if (!String(req.headers.authorization).startsWith('Bearer at-')) return send(401)
    if (graph === '/mailFolders/inbox/messages') {
      return send(200, { value: [{ id: LONG_ID, subject: 'Deck quote', from: { emailAddress: { name: 'Jan Botha', address: 'jan@client.test' } }, receivedDateTime: '2026-11-15T09:00:00Z', bodyPreview: 'Can you quote a deck?' }] })
    }
    if (graph === `/messages/${encodeURIComponent(LONG_ID)}` || graph === `/messages/${LONG_ID}`) {
      return send(200, { id: LONG_ID, subject: 'Deck quote', from: { emailAddress: { name: 'Jan Botha', address: 'jan@client.test' } }, replyTo: [], receivedDateTime: '2026-11-15T09:00:00Z', body: { contentType: 'text', content: 'Hi, can you quote a 4 by 5 metre deck?' }, internetMessageId: '<m1@client.test>', conversationId: 'c1' })
    }
    if (req.method === 'POST' && (graph.endsWith('/reply') || graph === '/sendMail')) return send(202)
    return send(404, { error: { code: 'NotFound' } })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
}

const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)
const get = (path: string) => new Request(`http://localhost:8888${path}`)
const post = (path: string, body: unknown) => new Request(`http://localhost:8888${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

suite('Outlook', () => {
  let user: SessionUser
  let mailHandler: (req: Request) => Promise<Response>
  let gmailHandler: (req: Request) => Promise<Response>
  let runTool: typeof import('../functions/_lib/assistant-tools.ts').runTool
  let oauth: typeof import('../functions/_lib/google-oauth.ts')
  let store: typeof import('../functions/_lib/gmail-store.ts')
  let mailStore: typeof import('../functions/_lib/mail-store.ts')
  const context = (): ToolContext => ({ userId: user.id, plan: user.plan, profile: user.profile, timeZone: 'Africa/Johannesburg', apiKey: 'unused', deadlineAt: Date.now() + 9_000, actions: [], emailRead: false, userText: '', chats: [], driving: false, inboxTitles: [] })
  const callback = (code: string) => get(`/api/mail/outlook/callback?code=${code}&state=${encodeURIComponent(oauth.createState(user.id))}`)
  const pageCode = async (res: Response) => /gmail=([a-z_]+)/.exec(await res.text())?.[1]

  beforeAll(async () => {
    process.env.MICROSOFT_STUB_URL = await startFakeMicrosoft()
    process.env.MICROSOFT_CLIENT_ID = 'test-ms-id'
    process.env.MICROSOFT_CLIENT_SECRET = 'test-ms-secret'
    mailHandler = (await import('../functions/mail.ts')).default
    gmailHandler = (await import('../functions/gmail.ts')).default
    runTool = (await import('../functions/_lib/assistant-tools.ts')).runTool
    oauth = await import('../functions/_lib/google-oauth.ts')
    store = await import('../functions/_lib/gmail-store.ts')
    mailStore = await import('../functions/_lib/mail-store.ts')
    const id = `outlooktest-${RUN}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, 'Test Dad', `outlooktest.${RUN}@example.com`])
    user = { id, email: `outlooktest.${RUN}@example.com`, plan: 'pro', planSource: 'default', isOwner: false, profile: { name: 'Dad Myers', businessName: 'Myers Decks', role: 'Owner', phone: '', signature: '', calendarUrl: '', nickname: '', businessAbout: '' } }
  })

  afterAll(async () => {
    await sql?.query('DELETE FROM "user" WHERE id = $1', [user?.id ?? ''])
    server?.close()
    for (const key of ['MICROSOFT_STUB_URL', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']) delete process.env[key]
  })

  beforeEach(async () => {
    await sql?.query('DELETE FROM api_usage WHERE user_id = $1', [user.id])
    hoisted.current = user
    calls.length = 0
  })

  it('sends a Pro user to Microsoft asking only to read and send mail', async () => {
    const res = await mailHandler(get('/api/mail/outlook/start'))
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.pathname).toBe('/authorize')
    expect(location.searchParams.get('scope')).toBe('openid email offline_access Mail.Read Mail.Send')
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:8888/api/mail/outlook/callback')
  })

  it('refuses a sign-in without the send permission, or with a forged state', async () => {
    expect(await pageCode(await mailHandler(callback('read-only')))).toBe('scopes')
    expect(await pageCode(await mailHandler(get('/api/mail/outlook/callback?code=good&state=forged.value')))).toBe('failed')
    expect(await mailStore.getAccount(user.id)).toBeNull()
  })

  it('connects and keeps the token encrypted', async () => {
    expect(await pageCode(await mailHandler(callback('good')))).toBe('connected')
    expect(await mailStore.getAccount(user.id)).toMatchObject({ provider: 'outlook', email: 'dad@outlook.test', secret: 'rt-1' })
    expect(await (await mailHandler(get('/api/mail/status'))).json()).toMatchObject({ connected: true, provider: 'outlook', microsoftReady: true })
  })

  it('searches with a short id, reads and replies through Outlook, and keeps the newest refresh token', async () => {
    const found = JSON.parse(await runTool('search_email', JSON.stringify({ query: 'from:jan subject:"deck quote" newer_than:7d' }), context())) as { emails: { id: string; from: string }[] }
    expect(found.emails[0]).toMatchObject({ from: 'Jan Botha <jan@client.test>' })
    const handle = found.emails[0].id
    expect(handle).toMatch(/^o[0-9a-f]{12}$/)
    const search = new URLSearchParams(calls[0].search).get('$search')
    expect(search).toBe('"from:jan AND subject:deck AND subject:quote AND received>=' + new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10) + '"')
    expect((await mailStore.getAccount(user.id))?.secret).toBe('rt-2')

    const recent = JSON.parse(await runTool('search_email', JSON.stringify({ query: 'is:unread' }), context())) as { emails: unknown[] }
    expect(recent.emails).toHaveLength(1)
    expect(new URLSearchParams(calls.at(-1)?.search).get('$filter')).toMatch(/^receivedDateTime ge .+ and isRead eq false$/)

    const read = JSON.parse(await runTool('read_email', JSON.stringify({ id: handle }), context())) as { text: string }
    expect(read.text).toContain('4 by 5 metre deck')
    await runTool('prepare_reply', JSON.stringify({ id: handle, body: 'Hi Jan, R12 500, I can start on the 5th.' }), context())
    const pending = await store.getPending(user.id)
    calls.length = 0
    expect(await (await gmailHandler(post('/api/gmail/send', { id: pending?.id }))).json()).toEqual({ sent: true, to: 'jan@client.test' })
    const reply = calls.find((call) => call.path.endsWith('/reply'))
    expect(reply).toBeDefined()
    const sent = JSON.parse(reply?.body ?? '{}') as { comment: string; message: { toRecipients: { emailAddress: { address: string } }[] } }
    expect(sent.message.toRecipients[0].emailAddress.address).toBe('jan@client.test')
    expect(sent.comment).toContain('R12 500')
  })

  it('sends a new email with sendMail and saves it to Sent Items', async () => {
    await runTool('prepare_email', JSON.stringify({ to: 'supplier@timber.test', subject: 'Order', body: 'Please send 20 deck boards.' }), context())
    const pending = await store.getPending(user.id)
    calls.length = 0
    expect(await (await gmailHandler(post('/api/gmail/send', { id: pending?.id }))).json()).toEqual({ sent: true, to: 'supplier@timber.test' })
    const sendMail = JSON.parse(calls.find((call) => call.path === '/sendMail')?.body ?? '{}') as { saveToSentItems: boolean; message: { subject: string } }
    expect(sendMail).toMatchObject({ saveToSentItems: true, message: { subject: 'Order' } })
  })

  it('asks to connect again when Microsoft cancels the permission', async () => {
    await mailStore.saveAccount(user.id, 'outlook', 'dad@outlook.test', 'rt-revoked', null)
    const { forgetOutlookToken } = await import('../functions/_lib/outlook-mail.ts')
    forgetOutlookToken(user.id)
    expect(await runTool('search_email', JSON.stringify({ query: 'deck' }), context())).toContain('connect their email again')
    expect(await (await mailHandler(get('/api/mail/status'))).json()).toMatchObject({ connected: true, needsReconnect: true })
    expect(await (await mailHandler(post('/api/mail/disconnect', {}))).json()).toEqual({ disconnected: true, provider: 'outlook' })
  })
})
