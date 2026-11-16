// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export interface GmailStatus {
  /** Google sign-in is set up on this server (client id and secret exist). */
  configured: boolean
  /** The person's plan includes Gmail. */
  allowed: boolean
  connected: boolean
  /** The Gmail address that was connected. */
  email: string | null
  /** Google stopped honouring the saved permission (it lasts 7 days while the app is in Google's test mode), so the person must connect again. */
  needsReconnect: boolean
  connectedAt: string | null
}

/** An email the assistant has written and is waiting for the person to approve. It can only be sent by the person, never by the assistant. */
export interface PendingEmail {
  id: string
  to: string
  subject: string
  body: string
  /** True when this is a reply to someone other than the person being answered, so the screen shows a warning. */
  differs: boolean
  replyToSubject: string | null
  expiresAt: string
}

export type GmailLogAction = 'connect' | 'disconnect' | 'search' | 'read' | 'prepare' | 'send' | 'cancel'

export interface GmailLogEntry {
  id: number
  action: GmailLogAction
  /** What it was about: a search phrase, the sender and subject of an email that was read, or who an email went to. */
  detail: string
  createdAt: string
}

/** Where the person's browser sends them after Google, with a short code the app turns into a message. */
export const GMAIL_RETURN_PARAM = 'gmail'
