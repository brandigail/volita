import type { CatchUp } from '../../types/catchup'

/** The messages Volita read from the screenshots, with the owner's own on the right as in the chat. */
export function ChatTranscript({ catchUp }: { catchUp: CatchUp }) {
  if (catchUp.messages.length === 0) return <p className="muted text-sm">No messages could be read.</p>
  return (
    <ul className="flex flex-col gap-2" aria-label="Messages in the chat">
      {catchUp.messages.map((message, index) => (
        <li key={index} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.mine ? 'self-end bg-brand-500/15' : 'self-start bg-black/5 dark:bg-white/10'}`}>
          {!message.mine && message.sender && <p className="text-xs font-semibold">{message.sender}</p>}
          <p className="whitespace-pre-wrap">{message.text}</p>
          {message.time && <p className="muted mt-0.5 text-xs">{message.time}</p>}
        </li>
      ))}
    </ul>
  )
}
