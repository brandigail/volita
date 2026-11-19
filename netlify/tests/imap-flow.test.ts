import { neon } from '@neondatabase/serverless'
import hoodiecrow, { type Server as ImapServer } from 'hoodiecrow-imap'
import { readFileSync } from 'node:fs'
import { SMTPServer } from 'smtp-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../functions/_lib/assistant-tools.ts'
import type { SessionUser } from '../functions/_lib/session.ts'

/**
 * Yahoo, AOL, iCloud and business email, for real: an encrypted IMAP server and two SMTP servers (port 465, and 587
 * with STARTTLS) run on this computer with a made-up mailbox. Connecting, searching, reading, replying, sending, a
 * cancelled app password and disconnecting all go through the real code and the real database.
 */

const hoisted = vi.hoisted(() => ({ current: null as SessionUser | null }))
vi.mock('../functions/_lib/session.ts', () => ({
  requireUser: async () => (hoisted.current ? { ok: true, user: hoisted.current } : { ok: false, response: new Response('{}', { status: 401 }) }),
}))

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip

const ADDRESS = 'dad@business.test'
const PASSWORD = 'app-password-1234'
const credentials = { key: readFileSync('node_modules/hoodiecrow-imap/cert/server.key'), cert: readFileSync('node_modules/hoodiecrow-imap/cert/server.crt') }
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)
const message = (headers: Record<string, string>, text: string) =>
  `${Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\r\n')}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`

let imap: ImapServer
const smtpServers: SMTPServer[] = []
const received: { to: string[]; raw: string }[] = []

function startImap(): Promise<void> {
  imap = hoodiecrow({
    secureConnection: true,
    credentials,
    users: { [ADDRESS]: { password: PASSWORD } },
    plugins: ['SPECIAL-USE', 'UIDPLUS'],
    storage: {
      INBOX: {
        messages: [
          {
            raw: message({ From: 'Jan Botha <jan@client.test>', To: ADDRESS, Subject: 'Deck quote', Date: daysAgo(2).toUTCString(), 'Message-ID': '<m1@client.test>', References: '<m0@client.test>' }, 'Hi, can you quote a 4 by 5 metre deck?\r\nThanks, Jan'),
            internaldate: daysAgo(2),
          },
          {
            raw: message({ From: 'Shop <noreply@shop.test>', 'Reply-To': 'Support <support@shop.test>', To: ADDRESS, Subject: 'Your order', Date: daysAgo(1).toUTCString(), 'Message-ID': '<m2@shop.test>' }, 'Your order has shipped.'),
            flags: ['\\Seen'],
            internaldate: daysAgo(1),
          },
        ],
      },
      '': { folders: { Sent: { 'special-use': '\\Sent', messages: [] } } },
    },
  })
  return new Promise((resolve) => imap.listen(993, '127.0.0.1', resolve))
}

function startSmtp(port: number, secure: boolean): Promise<void> {
  const server = new SMTPServer({
    secure,
    ...credentials,
    logger: false,
    onAuth: (auth, _session, callback) => (auth.username === ADDRESS && auth.password === PASSWORD ? callback(null, { user: ADDRESS }) : callback(new Error('Invalid username or password'))),
    onData: (stream, session, callback) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        received.push({ to: session.envelope.rcptTo.map((rcpt) => rcpt.address), raw: Buffer.concat(chunks).toString('utf8') })
        callback()
      })
    },
  })
  smtpServers.push(server)
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve()))
}

const sql = hasDb ? neon(process.env.DATABASE_URL ?? '') : null
const RUN = Math.random().toString(36).slice(2, 8)

const post = (path: string, body: unknown) => new Request(`http://localhost:8888${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const get = (path: string) => new Request(`http://localhost:8888${path}`)
const bodyText = (raw: string) => Buffer.from(raw.split('\r\n\r\n').slice(1).join('').replace(/\s+/g, ''), 'base64').toString('utf8')

suite('email with an app password (IMAP and SMTP)', () => {
  let user: SessionUser
  let mailHandler: (req: Request) => Promise<Response>
  let gmailHandler: (req: Request) => Promise<Response>
  let runTool: typeof import('../functions/_lib/assistant-tools.ts').runTool
  let store: typeof import('../functions/_lib/gmail-store.ts')
  let mailStore: typeof import('../functions/_lib/mail-store.ts')
  const context = (): ToolContext => ({ userId: user.id, plan: user.plan, profile: user.profile, timeZone: 'Africa/Johannesburg', apiKey: 'unused', deadlineAt: Date.now() + 9_000, actions: [], emailRead: false, userText: '', chats: [], driving: false })
  const connect = (smtpPort: number, password = PASSWORD) =>
    mailHandler(post('/api/mail/connect', { provider: 'other', email: ADDRESS, password, imap: { host: 'localhost', port: 993 }, smtp: { host: 'localhost', port: smtpPort } }))

  beforeAll(async () => {
    process.env.MAIL_TEST_ALLOW_LOCAL = 'true'
    await Promise.all([startImap(), startSmtp(465, true), startSmtp(587, false)])
    mailHandler = (await import('../functions/mail.ts')).default
    gmailHandler = (await import('../functions/gmail.ts')).default
    runTool = (await import('../functions/_lib/assistant-tools.ts')).runTool
    store = await import('../functions/_lib/gmail-store.ts')
    mailStore = await import('../functions/_lib/mail-store.ts')
    const id = `imaptest-${RUN}`
    await sql?.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [id, 'Test Dad', `imaptest.${RUN}@example.com`])
    user = { id, email: `imaptest.${RUN}@example.com`, plan: 'pro', planSource: 'default', isOwner: false, profile: { name: 'Dad Myers', businessName: 'Myers Decks', role: 'Owner', phone: '', signature: '', calendarUrl: '' } }
  })

  afterAll(async () => {
    await sql?.query('DELETE FROM "user" WHERE id = $1', [user?.id ?? ''])
    imap?.close()
    for (const server of smtpServers) server.close()
    delete process.env.MAIL_TEST_ALLOW_LOCAL
  })

  beforeEach(async () => {
    await sql?.query('DELETE FROM api_usage WHERE user_id = $1', [user.id])
    hoisted.current = user
  })

  it('refuses a wrong password and saves nothing', async () => {
    const res = await connect(465, 'wrong-password')
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/did not accept that email and password/)
    expect(await mailStore.getAccount(user.id)).toBeNull()
  })

  it('connects after checking both reading and sending, and keeps the password encrypted', async () => {
    const res = await connect(465)
    expect(await res.json()).toEqual({ connected: true })
    const [row] = (await sql?.query('SELECT email, secret, settings FROM mail_accounts WHERE user_id = $1', [user.id])) as { email: string; secret: string; settings: unknown }[]
    expect(row.secret.startsWith('enc1:') && row.email.startsWith('enc1:')).toBe(true)
    expect(JSON.stringify(row)).not.toContain(PASSWORD)
    const status = await (await mailHandler(get('/api/mail/status'))).json()
    expect(status).toMatchObject({ connected: true, provider: 'other', email: ADDRESS, needsReconnect: false })
  })

  it('finds, reads and answers an email, and the reply joins the conversation', async () => {
    const found = JSON.parse(await runTool('search_email', JSON.stringify({ query: 'from:jan newer_than:7d' }), context())) as { emails: { id: string; from: string; subject: string }[] }
    expect(found.emails).toHaveLength(1)
    expect(found.emails[0]).toMatchObject({ from: 'Jan Botha <jan@client.test>', subject: 'Deck quote' })
    const words = JSON.parse(await runTool('search_email', JSON.stringify({ query: 'deck' }), context())) as { emails: unknown[] }
    expect(words.emails).toHaveLength(1)
    const unread = JSON.parse(await runTool('search_email', JSON.stringify({ query: 'is:unread' }), context())) as { emails: { subject: string }[] }
    expect(unread.emails.map((mail) => mail.subject)).toEqual(['Deck quote'])

    const id = found.emails[0].id
    const read = JSON.parse(await runTool('read_email', JSON.stringify({ id }), context())) as { text: string }
    expect(read.text).toContain('4 by 5 metre deck')

    const prepared = JSON.parse(await runTool('prepare_reply', JSON.stringify({ id, body: 'Hi Jan, the deck is R12 500 and I can start on the 5th of December.' }), context())) as { to: string }
    expect(prepared.to).toBe('jan@client.test')
    const pending = await store.getPending(user.id)
    expect(pending).not.toBeNull()

    received.length = 0
    const sent = await gmailHandler(post('/api/gmail/send', { id: pending?.id }))
    expect(await sent.json()).toEqual({ sent: true, to: 'jan@client.test' })
    expect(received).toHaveLength(1)
    expect(received[0].to).toEqual(['jan@client.test'])
    expect(received[0].raw).toContain('In-Reply-To: <m1@client.test>')
    expect(received[0].raw).toContain('References: <m0@client.test> <m1@client.test>')
    expect(received[0].raw).toContain('Subject: Re: Deck quote')
    expect(received[0].raw).toMatch(/^Date: /m)
    expect(received[0].raw).toMatch(/^Message-ID: <.+@business\.test>/m)
    expect(bodyText(received[0].raw)).toContain('R12 500')

    const filed = JSON.parse(await runTool('search_email', JSON.stringify({ query: 'in:sent' }), context())) as { emails: { subject: string }[] }
    expect(filed.emails.map((mail) => mail.subject)).toEqual(['Re: Deck quote'])
  })

  it('reading never marks an email as read', async () => {
    const unread = JSON.parse(await runTool('search_email', JSON.stringify({ query: 'is:unread' }), context())) as { emails: unknown[] }
    expect(unread.emails).toHaveLength(1)
  })

  it('also sends through port 587, where the connection must switch to encryption first', async () => {
    expect(await (await connect(587)).json()).toEqual({ connected: true })
    await runTool('prepare_email', JSON.stringify({ to: 'supplier@timber.test', subject: 'Order', body: 'Please send 20 deck boards.' }), context())
    const pending = await store.getPending(user.id)
    received.length = 0
    expect(await (await gmailHandler(post('/api/gmail/send', { id: pending?.id }))).json()).toEqual({ sent: true, to: 'supplier@timber.test' })
    expect(received[0]?.to).toEqual(['supplier@timber.test'])
  })

  it('asks to connect again when the app password stops working', async () => {
    const account = await mailStore.getAccount(user.id)
    await mailStore.saveAccount(user.id, 'other', ADDRESS, 'cancelled-password', account?.settings ?? null)
    expect(await runTool('search_email', JSON.stringify({ query: 'deck' }), context())).toContain('connect their email again')
    expect(await (await mailHandler(get('/api/mail/status'))).json()).toMatchObject({ connected: true, needsReconnect: true })
  })

  it('disconnecting deletes the saved details', async () => {
    expect(await (await mailHandler(post('/api/mail/disconnect', {}))).json()).toEqual({ disconnected: true, provider: 'other' })
    expect(await mailStore.getAccount(user.id)).toBeNull()
    expect(await (await mailHandler(get('/api/mail/status'))).json()).toMatchObject({ connected: false, provider: null })
  })

  it('refuses mail servers that are not public', async () => {
    const res = await mailHandler(post('/api/mail/connect', { provider: 'other', email: ADDRESS, password: PASSWORD, imap: { host: 'intranet.local', port: 993 }, smtp: { host: 'localhost', port: 465 } }))
    expect(res.status).toBe(400)
    const { isPublicAddress } = await import('../functions/_lib/mail-host.ts')
    expect(['10.0.0.5', '127.0.0.1', '169.254.169.254', '192.168.1.10', '172.16.0.1', '::1', 'fd00::1'].some(isPublicAddress)).toBe(false)
    expect(isPublicAddress('8.8.8.8')).toBe(true)
  })
})
