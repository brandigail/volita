import { readMail, searchMail, sendMail } from './gmail-api.ts'
import { getConnection } from './gmail-store.ts'
import { readImap, searchImap, sendImap, type PasswordAccount } from './imap-mail.ts'
import { getAccount, markAccountNeedsReconnect } from './mail-store.ts'
import type { MailMessage, MailResult, MailSummary, SendRequest } from './mail-types.ts'
import { readOutlook, searchOutlook, sendOutlook } from './outlook-mail.ts'

/**
 * The person's mailbox, whichever service it is: Gmail, Outlook, or one reached with an app password. The assistant's
 * email tools and the Send button only talk to this file.
 */

type Mailbox = { kind: 'gmail' } | { kind: 'outlook' } | { kind: 'password'; account: PasswordAccount } | { kind: 'reconnect' }

async function mailboxFor(userId: string): Promise<Mailbox | null> {
  const account = await getAccount(userId)
  if (account) {
    if (account.needsReconnect) return { kind: 'reconnect' }
    if (account.provider === 'outlook') return { kind: 'outlook' }
    if (!account.settings) return { kind: 'reconnect' }
    return { kind: 'password', account: { email: account.email, password: account.secret, ...account.settings } }
  }
  return (await getConnection(userId)) ? { kind: 'gmail' } : null
}

/** A rejected app password means it was cancelled or changed: the card on Profile then asks to connect again. */
async function noting<T>(userId: string, result: MailResult<T>): Promise<MailResult<T>> {
  if (!result.ok && result.reason === 'reconnect') await markAccountNeedsReconnect(userId)
  return result
}

export async function searchMailbox(userId: string, query: string, max: number): Promise<MailResult<MailSummary[]>> {
  const box = await mailboxFor(userId)
  if (!box) return { ok: false, reason: 'not_connected' }
  switch (box.kind) {
    case 'reconnect':
      return { ok: false, reason: 'reconnect' }
    case 'gmail':
      return searchMail(userId, query, max)
    case 'outlook':
      return searchOutlook(userId, query, max)
    case 'password':
      return noting(userId, await searchImap(box.account, query, max))
  }
}

export async function readMailbox(userId: string, id: string): Promise<MailResult<MailMessage>> {
  const box = await mailboxFor(userId)
  if (!box) return { ok: false, reason: 'not_connected' }
  switch (box.kind) {
    case 'reconnect':
      return { ok: false, reason: 'reconnect' }
    case 'gmail':
      return readMail(userId, id)
    case 'outlook':
      return readOutlook(userId, id)
    case 'password':
      return noting(userId, await readImap(box.account, id))
  }
}

/** Sends an email the person approved. A reply carries the original's headers, so it joins the same conversation. */
export async function sendFromMailbox(userId: string, email: SendRequest): Promise<MailResult<null>> {
  const box = await mailboxFor(userId)
  if (!box) return { ok: false, reason: 'not_connected' }
  if (box.kind === 'reconnect') return { ok: false, reason: 'reconnect' }
  if (box.kind === 'outlook') return sendOutlook(userId, email)

  const original = email.replyToId ? await readMailbox(userId, email.replyToId) : null
  const answered = original?.ok ? original.value : null
  if (box.kind === 'password') return noting(userId, await sendImap(box.account, email, answered))

  const sent = await sendMail(userId, {
    to: email.to,
    subject: email.subject,
    body: email.body,
    threadId: email.threadId,
    inReplyTo: answered?.messageIdHeader || undefined,
    references: answered?.messageIdHeader ? `${answered.references} ${answered.messageIdHeader}`.trim().slice(-900) : undefined,
  })
  return sent.ok ? { ok: true, value: null } : sent
}
