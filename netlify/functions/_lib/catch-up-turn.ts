import { asksAboutPerson, wantsCatchUp } from '../../../src/lib/chat-intent.ts'
import { catchUpSystemPrompt } from './assistant-prompt.ts'
import { runTool, type ToolContext } from './assistant-tools.ts'
import { chat, type ChatMessage } from './groq-chat.ts'

/** Turns of the conversation kept for a catch-up: enough to know who "her" is, small enough to stay cheap. */
const HISTORY_TURNS = 4
const MIN_ROUND_MS = 1_200

export interface CatchUpRequest {
  /** What the person said, newest last. */
  turns: { role: 'user' | 'assistant'; content: string }[]
  /** The app read chats from the phone for this turn, or the person asked about chats and there are some to read. */
  chatsReadThisTurn: boolean
}

/**
 * Whether this turn is "catch me up" with chats in hand. Such a turn does not need the whole toolbox: the messages are already
 * here, so answering takes one small model call instead of two large ones. That matters because the free AI service allows
 * only about 8,000 tokens a minute per model, and a normal assistant turn alone costs about 5,000 for each call it makes.
 */
export function isCatchUpTurn(lastUserText: string, ctx: ToolContext, chatsReadThisTurn: boolean): boolean {
  const hasChats = ctx.chats.length > 0 || ctx.inboxTitles.length > 0
  if (!hasChats) return false
  return chatsReadThisTurn || wantsCatchUp(lastUserText) || asksAboutPerson(lastUserText)
}

export type CatchUpAnswer = { ok: true; reply: string } | { ok: false; status: number }

/** Answers a catch-up turn with one model call that has no tools, trying each model in turn if one is busy. */
export async function answerCatchUp(request: CatchUpRequest, ctx: ToolContext, models: string[]): Promise<CatchUpAnswer> {
  // Runs the same code the catch_up tool would, so the chats, the email and the notes are exactly what the tool gives.
  const found = await runTool('catch_up', '{}', ctx)
  const messages: ChatMessage[] = [
    { role: 'system', content: catchUpSystemPrompt(ctx.profile, ctx.timeZone, found, ctx.driving) },
    ...request.turns.slice(-HISTORY_TURNS).map(({ role, content }): ChatMessage => ({ role, content })),
  ]

  let status = 502
  for (const model of models) {
    const remaining = ctx.deadlineAt - Date.now()
    if (remaining < MIN_ROUND_MS) return { ok: false, status: 504 }
    const result = await chat(ctx.apiKey, messages, remaining, { temperature: 0.4, model })
    if (result.ok) {
      const reply = result.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (reply) return { ok: true, reply }
      status = 502
      continue
    }
    status = result.status
    // Only a busy model is worth trying the next one for.
    if (result.status !== 429) break
  }
  return { ok: false, status }
}
