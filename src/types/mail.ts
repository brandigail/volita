// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/**
 * The email services a person can connect. Gmail and Outlook use the provider's own sign-in button. The rest use the
 * standard mail protocols (IMAP to read, SMTP to send) with an app password the person makes in their email account.
 */
export type MailProviderId = 'gmail' | 'outlook' | 'yahoo' | 'aol' | 'icloud' | 'zoho' | 'other'

/** How the connection is made: a sign-in button, or an email address and (app) password. */
export type MailConnectKind = 'google' | 'microsoft' | 'password'

export interface MailServer {
  host: string
  port: number
  /** True: encrypted from the start (ports 993 and 465). False: the connection must upgrade to encryption (port 587). */
  secure: boolean
}

export interface MailPreset {
  id: MailProviderId
  label: string
  kind: MailConnectKind
  /** Addresses that belong to this service, so typing an address can pick it. */
  domains: readonly string[]
  imap?: MailServer
  smtp?: MailServer
  /** Steps for making an app password, in plain words. */
  passwordSteps?: readonly string[]
  passwordUrl?: string
}

export const MAIL_PRESETS: readonly MailPreset[] = [
  { id: 'gmail', label: 'Gmail', kind: 'google', domains: ['gmail.com', 'googlemail.com'] },
  { id: 'outlook', label: 'Outlook or Hotmail', kind: 'microsoft', domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.co.za', 'hotmail.co.za', 'live.co.za'] },
  {
    id: 'yahoo',
    label: 'Yahoo',
    kind: 'password',
    domains: ['yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com'],
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    passwordSteps: ['Open the Yahoo app password page (link below) and sign in.', 'Type "Volita" as the app name and tap Generate password.', 'Copy the password it shows and paste it here.'],
    passwordUrl: 'https://login.yahoo.com/account/security/app-passwords',
  },
  {
    id: 'aol',
    label: 'AOL',
    kind: 'password',
    domains: ['aol.com', 'aim.com'],
    imap: { host: 'imap.aol.com', port: 993, secure: true },
    smtp: { host: 'smtp.aol.com', port: 465, secure: true },
    passwordSteps: ['Open the AOL app password page (link below) and sign in.', 'Type "Volita" as the app name and tap Generate password.', 'Copy the password it shows and paste it here.'],
    passwordUrl: 'https://login.aol.com/account/security/app-passwords',
  },
  {
    id: 'icloud',
    label: 'iCloud Mail',
    kind: 'password',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    passwordSteps: ['Open your Apple Account page (link below) and sign in.', 'Go to Sign-In and Security, then App-Specific Passwords, and make one called "Volita".', 'Copy it (it looks like abcd-efgh-ijkl-mnop) and paste it here.'],
    passwordUrl: 'https://account.apple.com/account/manage',
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    kind: 'password',
    domains: ['zoho.com', 'zohomail.com'],
    imap: { host: 'imap.zoho.com', port: 993, secure: true },
    smtp: { host: 'smtp.zoho.com', port: 465, secure: true },
    passwordSteps: ['In Zoho Mail settings, turn on IMAP access.', 'In your Zoho account security page (link below), make an app password called "Volita".', 'Copy it and paste it here.'],
    passwordUrl: 'https://accounts.zoho.com/home#security/app_password',
  },
  {
    id: 'other',
    label: 'Business or other email',
    kind: 'password',
    domains: [],
    passwordSteps: [
      'Use the same details you would put into the Mail app on your phone. Your email or website company lists them (often mail.yourbusiness.co.za).',
      'The password is your email password, or an app password if your provider uses them.',
    ],
  },
]

export function presetFor(id: MailProviderId): MailPreset {
  return MAIL_PRESETS.find((preset) => preset.id === id) ?? MAIL_PRESETS[MAIL_PRESETS.length - 1]
}

/** The service an address most likely belongs to, from the part after the @. */
export function guessProvider(email: string): MailProviderId {
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  return MAIL_PRESETS.find((preset) => preset.domains.includes(domain))?.id ?? 'other'
}

/** Ports Volita will connect to: only the encrypted mail ports. */
export const IMAP_PORTS = [993] as const
export const SMTP_PORTS = [465, 587] as const

/** The connection status the Profile card shows. */
export interface MailStatus {
  /** The person's plan includes email. */
  allowed: boolean
  connected: boolean
  provider: MailProviderId | null
  email: string | null
  /** The saved permission or password stopped working, so the person must connect again. */
  needsReconnect: boolean
  connectedAt: string | null
  /** Whether each sign-in button is set up on this server. */
  googleReady: boolean
  microsoftReady: boolean
}
