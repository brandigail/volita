/** What every email service returns, so the assistant and the Send button work the same whichever one is connected. */

export type MailFailure = 'not_connected' | 'reconnect' | 'failed' | 'not_found'
export type MailResult<T> = { ok: true; value: T } | { ok: false; reason: MailFailure }

export const FAILURE_MESSAGE: Record<MailFailure, string> = {
  not_connected: 'Their email is not connected. Tell them to connect it on the Profile tab.',
  reconnect: 'The email connection has stopped working. Tell them to connect their email again on the Profile tab.',
  failed: 'Their email service did not answer. Say you could not reach their email right now and they can try again in a moment.',
  not_found: 'That email was not found.',
}

export interface MailSummary {
  id: string
  from: string
  subject: string
  date: string
  snippet: string
}

export interface MailMessage extends MailSummary {
  threadId: string
  /** Who a reply goes to: the Reply-To address if there is one, otherwise the sender. */
  replyTo: string | null
  messageIdHeader: string
  references: string
  body: string
}

/** An approved email, ready to go. */
export interface SendRequest {
  to: string
  subject: string
  body: string
  /** Gmail's conversation id, when answering in Gmail. */
  threadId: string | null
  /** The id of the email being answered, if this is a reply. */
  replyToId: string | null
}

export const SNIPPET_CHARS = 160
export const MAX_RESULTS = 5
