// hoodiecrow-imap (a test IMAP server) ships without types; this is the part the tests use.
declare module 'hoodiecrow-imap' {
  interface StoredMessage {
    raw: string
    flags?: string[]
    internaldate?: string | Date
  }
  interface Mailbox {
    messages?: StoredMessage[]
    folders?: Record<string, Mailbox>
    'special-use'?: string
  }
  interface Options {
    secureConnection?: boolean
    credentials?: { key: Buffer; cert: Buffer }
    users?: Record<string, { password: string }>
    plugins?: string[]
    storage?: Record<string, Mailbox>
  }
  interface Server {
    listen(port: number, host: string, callback?: () => void): void
    close(callback?: () => void): void
    folderCache: Record<string, Mailbox>
  }
  export default function hoodiecrow(options: Options): Server
}
