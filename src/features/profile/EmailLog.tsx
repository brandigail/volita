import type { GmailLogEntry } from '../../types/gmail'

function describeLog(entry: GmailLogEntry): string {
  switch (entry.action) {
    case 'connect':
      return `Connected ${entry.detail}`
    case 'disconnect':
      return entry.detail ? `Disconnected ${entry.detail}` : 'Disconnected your email'
    case 'search':
      return `Looked for “${entry.detail}”`
    case 'read':
      return `Read an email: ${entry.detail}`
    case 'prepare':
      return `Wrote an email for your approval: ${entry.detail}`
    case 'send':
      return `You sent an email: ${entry.detail}`
    case 'cancel':
      return 'You cancelled a waiting email'
  }
}

/** Everything Volita has done with the person's email, newest first. */
export function EmailLog({ entries }: { entries: GmailLogEntry[] }) {
  if (entries.length === 0) return <p className="muted text-sm">Nothing yet.</p>
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto text-sm" aria-label="Email record">
      {entries.map((entry) => (
        <li key={entry.id} className="border-b border-(--line) pb-2">
          <p>{describeLog(entry)}</p>
          <p className="muted text-xs">{new Date(entry.createdAt).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  )
}
