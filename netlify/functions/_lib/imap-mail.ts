import { randomUUID } from 'node:crypto'
import { ImapFlow, type SearchObject } from 'imapflow'
import { simpleParser, type AddressObject } from 'mailparser'
import nodemailer from 'nodemailer'
import type { MailServer } from '../../../src/types/mail.ts'
import { buildRawMessage, decodeBase64Url, htmlToText, MAX_BODY_CHARS } from './gmail-mime.ts'
import { checkMailHost } from './mail-host.ts'
import { parseMailQuery, type MailQuery } from './mail-query.ts'
import { MAX_RESULTS, SNIPPET_CHARS, type MailFailure, type MailMessage, type MailResult, type MailSummary, type SendRequest } from './mail-types.ts'
import { describeError } from './safe-log.ts'

/**
 * Yahoo, AOL, iCloud, Zoho and business email, through the standard mail protocols: IMAP to read, SMTP to send. Mail is
 * only ever looked at (never marked as read, moved or deleted), and only encrypted connections are used.
 */

export interface PasswordAccount {
  email: string
  password: string
  imap: MailServer
  smtp: MailServer
}

const CONNECT_MS = 6_000
const SOCKET_MS = 8_000
const DAY_MS = 86_400_000
/** "i" for the inbox or "s" for sent mail, then the mailbox's UIDVALIDITY and the message's UID. */
const MESSAGE_ID = /^([is])(\d{1,20})\.(\d{1,10})$/
const SNIPPET_BYTES = 48_000
const MESSAGE_BYTES = 2_000_000

/** Test servers on this computer use made-up certificates; only then is the certificate check relaxed. */
const testing = () => process.env.MAIL_TEST_ALLOW_LOCAL === 'true'

function errorCode(err: unknown, key: string): unknown {
  return typeof err === 'object' && err !== null && key in err ? (err as Record<string, unknown>)[key] : undefined
}

/** A wrong or cancelled password, as opposed to a server that could not be reached. */
export function isAuthFailure(err: unknown): boolean {
  return errorCode(err, 'authenticationFailed') === true || errorCode(err, 'code') === 'EAUTH' || errorCode(err, 'responseCode') === 535
}

function failure(err: unknown, what: string): { ok: false; reason: MailFailure } {
  if (!isAuthFailure(err)) console.error(`${what} failed:`, describeError(err))
  return { ok: false, reason: isAuthFailure(err) ? 'reconnect' : 'failed' }
}

/** Opens an IMAP session, runs `work`, and always closes it again. */
export async function withImap<T>(account: PasswordAccount, work: (client: ImapFlow) => Promise<T>): Promise<MailResult<T>> {
  const host = await checkMailHost(account.imap.host)
  if (!host.ok) return { ok: false, reason: 'failed' }
  const client = new ImapFlow({
    host: host.address,
    servername: host.servername,
    port: account.imap.port,
    secure: true,
    auth: { user: account.email, pass: account.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: CONNECT_MS,
    greetingTimeout: CONNECT_MS,
    socketTimeout: SOCKET_MS,
    tls: { servername: host.servername, rejectUnauthorized: !testing() },
  })
  // A dropped connection is reported through the result; it must not become an unhandled error event.
  client.on('error', () => undefined)
  try {
    await client.connect()
    return { ok: true, value: await work(client) }
  } catch (err) {
    return failure(err, 'Email reading')
  } finally {
    await client.logout().catch(() => client.close())
  }
}

async function sentPath(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list()
  return boxes.find((box) => box.specialUse === '\\Sent')?.path ?? null
}

function criteria(query: MailQuery): SearchObject {
  const search: SearchObject = {}
  if (query.from.length > 0) search.from = query.from.join(' ')
  if (query.to.length > 0) search.to = query.to.join(' ')
  if (query.subject.length > 0) search.subject = query.subject.join(' ')
  if (query.since) search.since = query.since
  if (query.before) search.before = query.before
  if (query.unread !== null) search.seen = !query.unread
  const words = query.words.join(' ').trim()
  if (words) search.or = [{ subject: words }, { from: words }, { body: words }]
  // Nothing to search for means "recent mail".
  if (Object.keys(search).length === 0) search.since = new Date(Date.now() - 30 * DAY_MS)
  return search
}

function sender(address: AddressObject | AddressObject[] | undefined): { name: string; email: string } | null {
  const first = (Array.isArray(address) ? address[0] : address)?.value[0]
  return first?.address ? { name: first.name ?? '', email: first.address.toLowerCase() } : null
}

const describe = (who: { name: string; email: string } | null) => (who ? (who.name ? `${who.name} <${who.email}>` : who.email) : '')

async function parse(source: Buffer | undefined) {
  const mail = await simpleParser(source ?? Buffer.alloc(0), { skipImageLinks: true, skipTextToHtml: true })
  const text = (mail.text ?? (typeof mail.html === 'string' ? htmlToText(mail.html) : '')).replace(/\r\n?/g, '\n').trim()
  return { mail, text }
}

export async function searchImap(account: PasswordAccount, query: string, max: number): Promise<MailResult<MailSummary[]>> {
  const parsed = parseMailQuery(query)
  return withImap(account, async (client) => {
    const path = parsed.folder === 'sent' ? await sentPath(client) : 'INBOX'
    if (!path) return []
    const lock = await client.getMailboxLock(path, { readOnly: true })
    try {
      const box = client.mailbox
      const validity = box ? String(box.uidValidity) : '0'
      const uids = (await client.search(criteria(parsed), { uid: true })) || []
      // Higher numbers arrived later, so the highest are the newest.
      const newest = [...uids].sort((a, b) => b - a).slice(0, Math.min(Math.max(max, 1), MAX_RESULTS))
      const found: MailSummary[] = []
      for (const uid of newest) {
        const message = await client.fetchOne(String(uid), { uid: true, source: { maxLength: SNIPPET_BYTES } }, { uid: true })
        if (!message) continue
        const { mail, text } = await parse(message.source)
        found.push({
          id: `${parsed.folder === 'sent' ? 's' : 'i'}${validity}.${uid}`,
          from: describe(sender(mail.from)).slice(0, 120),
          subject: (mail.subject ?? '').slice(0, 160),
          date: mail.date ? mail.date.toUTCString() : '',
          snippet: text.replace(/\s+/g, ' ').slice(0, SNIPPET_CHARS),
        })
      }
      return found
    } finally {
      lock.release()
    }
  })
}

export async function readImap(account: PasswordAccount, id: string): Promise<MailResult<MailMessage>> {
  const match = MESSAGE_ID.exec(id)
  if (!match) return { ok: false, reason: 'not_found' }
  const [, folder, validity, uid] = match
  const result = await withImap(account, async (client): Promise<MailMessage | null> => {
    const path = folder === 's' ? await sentPath(client) : 'INBOX'
    if (!path) return null
    const lock = await client.getMailboxLock(path, { readOnly: true })
    try {
      // A changed UIDVALIDITY means the numbers were reissued, so the old id may now point at a different email.
      if (!client.mailbox || String(client.mailbox.uidValidity) !== validity) return null
      const message = await client.fetchOne(uid, { uid: true, source: { maxLength: MESSAGE_BYTES } }, { uid: true })
      if (!message) return null
      const { mail, text } = await parse(message.source)
      const from = sender(mail.from)
      const references = Array.isArray(mail.references) ? mail.references.join(' ') : (mail.references ?? '')
      return {
        id,
        from: describe(from).slice(0, 120),
        subject: (mail.subject ?? '').slice(0, 160),
        date: mail.date ? mail.date.toUTCString() : '',
        snippet: text.replace(/\s+/g, ' ').slice(0, SNIPPET_CHARS),
        threadId: '',
        replyTo: sender(mail.replyTo)?.email ?? from?.email ?? null,
        messageIdHeader: mail.messageId ?? '',
        references,
        body: text.slice(0, MAX_BODY_CHARS),
      }
    } finally {
      lock.release()
    }
  })
  if (!result.ok) return result
  return result.value ? { ok: true, value: result.value } : { ok: false, reason: 'not_found' }
}

function smtpTransport(server: MailServer, address: string, servername: string, account: PasswordAccount) {
  return nodemailer.createTransport({
    host: address,
    port: server.port,
    secure: server.secure,
    // Port 587 starts plain and must switch to encryption before the password is sent; refuse if it will not.
    requireTLS: !server.secure,
    auth: { user: account.email, pass: account.password },
    tls: { servername, rejectUnauthorized: !testing() },
    connectionTimeout: CONNECT_MS,
    greetingTimeout: CONNECT_MS,
    socketTimeout: SOCKET_MS,
  })
}

/** Checks both the reading and the sending side with the details given, before anything is saved. */
export async function verifyPasswordAccount(account: PasswordAccount): Promise<{ ok: true } | { ok: false; side: 'imap' | 'smtp'; auth: boolean }> {
  const [imap, smtp] = await Promise.all([
    withImap(account, async () => true),
    (async () => {
      const host = await checkMailHost(account.smtp.host)
      if (!host.ok) return { ok: false as const, auth: false }
      try {
        await smtpTransport(account.smtp, host.address, host.servername, account).verify()
        return { ok: true as const }
      } catch (err) {
        if (!isAuthFailure(err)) console.error('Email sending check failed:', describeError(err))
        return { ok: false as const, auth: isAuthFailure(err) }
      }
    })(),
  ])
  if (!imap.ok) return { ok: false, side: 'imap', auth: imap.reason === 'reconnect' }
  if (!smtp.ok) return { ok: false, side: 'smtp', auth: smtp.auth }
  return { ok: true }
}

/** Sends an approved email, then files a copy in the person's Sent folder (most of these services do not do it themselves). */
export async function sendImap(account: PasswordAccount, email: SendRequest, original: MailMessage | null): Promise<MailResult<null>> {
  let message: string
  try {
    const raw = decodeBase64Url(
      buildRawMessage({
        from: account.email,
        to: email.to,
        subject: email.subject,
        body: email.body,
        inReplyTo: original?.messageIdHeader || undefined,
        references: original ? `${original.references} ${original.messageIdHeader}`.trim().slice(-900) || undefined : undefined,
      }),
    )
    const domain = account.email.split('@')[1] ?? 'volita.app'
    message = `Date: ${new Date().toUTCString()}\r\nMessage-ID: <${randomUUID()}@${domain}>\r\n${raw}`
  } catch {
    return { ok: false, reason: 'failed' }
  }
  const host = await checkMailHost(account.smtp.host)
  if (!host.ok) return { ok: false, reason: 'failed' }
  try {
    await smtpTransport(account.smtp, host.address, host.servername, account).sendMail({ envelope: { from: account.email, to: [email.to] }, raw: message })
  } catch (err) {
    return failure(err, 'Email sending')
  }
  await withImap(account, async (client) => {
    const path = await sentPath(client)
    if (path) await client.append(path, message, ['\\Seen'])
  })
  return { ok: true, value: null }
}
