import { z } from 'zod'

// Shared by the client and the `read-chat` function. Keep this file free of DOM and Node APIs.

/** Screenshots one catch-up may read at once (a longer chat is often two or three screens). */
export const MAX_CHAT_IMAGES = 4

export const chatMessageSchema = z.object({
  /** Who wrote it, as shown in the chat (a name, a number, or "Me"). */
  sender: z.string().trim().max(80),
  /** True when the person using Volita wrote it, so the reply knows which side they are on. */
  mine: z.boolean(),
  text: z.string().trim().max(2000),
  /** The time or day shown beside it, if any. */
  time: z.string().trim().max(40).default(''),
})

export const catchUpSchema = z.object({
  /** The customer or group the chat is with, as shown at the top of the screenshot. */
  contact: z.string().trim().max(80),
  /** Two or three plain sentences: what they said and what they are waiting for. */
  summary: z.string().trim().min(1).max(700),
  /** Oldest first. */
  messages: z.array(chatMessageSchema).max(60),
  /** True when the last message is from someone else and still unanswered. */
  needsReply: z.boolean(),
  /** What the other person is asking for (a price, a time, a photo...), one short phrase each. */
  asked: z.array(z.string().trim().max(120)).max(8),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
export type CatchUp = z.infer<typeof catchUpSchema>

/** How much of the chat is handed to the draft writer; the draft endpoint accepts at most 10,000 characters in all. */
const MAX_CONTEXT_CHARS = 6_000

/** The conversation as plain text, to hand to the draft writer as context for the reply. Keeps the newest messages if it is long. */
export function chatAsText(catchUp: CatchUp): string {
  const kept: string[] = []
  let used = 0
  for (const message of [...catchUp.messages].reverse()) {
    const line = `${message.mine ? 'Me' : message.sender || 'Them'}: ${message.text}`
    if (used + line.length > MAX_CONTEXT_CHARS && kept.length > 0) break
    kept.unshift(line.slice(0, MAX_CONTEXT_CHARS))
    used += line.length
  }
  return `Chat with ${catchUp.contact || 'a customer'}:\n${kept.join('\n')}`
}

/** The reading as one plain paragraph, for places that only show or speak text (the iPhone Shortcut). */
export function readoutOf(catchUp: CatchUp): string {
  const who = catchUp.contact ? `${catchUp.contact}: ` : ''
  const wants = catchUp.asked.length > 0 ? ` They want: ${catchUp.asked.join('; ')}.` : ''
  const waiting = catchUp.needsReply ? ' They are waiting for your reply.' : ''
  return `${who}${catchUp.summary}${wants}${waiting}`
}
