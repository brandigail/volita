import { neon } from '@neondatabase/serverless'
import { z } from 'zod'
import { formatRand } from '../../../src/lib/money.ts'
import type { ToolContext } from './assistant-tools.ts'
import { listAgenda } from './agenda.ts'
import { moneyOwed } from './business-store.ts'
import type { ToolDefinition } from './groq-chat.ts'
import { addDays, formatWhen, startOfZonedDay, todayIn } from './time.ts'

/** The assistant's spoken summaries: how the week or month went, and the wrap-up at the end of a working day. Both only read. */

export const SUMMARY_TOOL_NAMES = new Set(['money_summary', 'day_wrap'])

export const SUMMARY_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'money_summary',
      description: 'How the last week or month went: quotes sent, invoiced, paid, and what is outstanding. Use for "how was my week", "what did I earn this month", "weekly summary".',
      parameters: { type: 'object', properties: { period: { type: 'string', enum: ['week', 'month'], description: 'The last 7 days or the last 30 days. Defaults to week.' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'day_wrap',
      description: 'The end-of-day wrap-up: what got done today, quotes and messages sent, money paid and owed, and the first job tomorrow. Use for "wrap up my day", "end of day", "what is left for tomorrow".',
      parameters: { type: 'object', properties: {} },
    },
  },
]

const periodArgs = z.object({ period: z.enum(['week', 'month']).default('week') })
const sql = () => neon(process.env.DATABASE_URL ?? '')
const DAYS: Record<'week' | 'month', number> = { week: 7, month: 30 }

interface InvoiceTotals {
  invoiced_count: number
  invoiced_cents: string
  paid_count: number
  paid_cents: string
}

async function moneySummary(args: unknown, ctx: ToolContext): Promise<string> {
  const { period } = periodArgs.parse(args ?? {})
  const since = addDays(new Date(), -DAYS[period]).toISOString()
  const [quotes, totals, owed] = await Promise.all([
    sql().query("SELECT count(*)::int AS n FROM drafts WHERE user_id = $1 AND category = 'QUOTE' AND sent_at >= $2", [ctx.userId, since]) as unknown as Promise<{ n: number }[]>,
    sql().query(
      `SELECT count(*) FILTER (WHERE created_at >= $2 AND status IN ('SENT', 'PAID'))::int AS invoiced_count,
              COALESCE(sum(total_cents) FILTER (WHERE created_at >= $2 AND status IN ('SENT', 'PAID')), 0)::text AS invoiced_cents,
              count(*) FILTER (WHERE paid_at >= $2)::int AS paid_count,
              COALESCE(sum(total_cents) FILTER (WHERE paid_at >= $2), 0)::text AS paid_cents
       FROM invoices WHERE user_id = $1`,
      [ctx.userId, since],
    ) as unknown as Promise<InvoiceTotals[]>,
    moneyOwed(ctx.userId, todayIn(ctx.timeZone)),
  ])
  const row = totals[0]
  return JSON.stringify({
    period: period === 'week' ? 'the last 7 days' : 'the last 30 days',
    quotesSent: quotes[0]?.n ?? 0,
    invoiced: { count: row?.invoiced_count ?? 0, total: formatRand(Number(row?.invoiced_cents ?? 0)) },
    paid: { count: row?.paid_count ?? 0, total: formatRand(Number(row?.paid_cents ?? 0)) },
    stillOwed: formatRand(owed.owedCents),
    overdue: formatRand(owed.overdueCents),
    note: 'Quotes are counted, not added up, because a quote is written text. Say the figures plainly and mention what is overdue.',
  })
}

async function dayWrap(ctx: ToolContext): Promise<string> {
  const today = todayIn(ctx.timeZone)
  const tomorrow = todayIn(ctx.timeZone, addDays(new Date(), 1))
  const startToday = startOfZonedDay(today, ctx.timeZone) ?? new Date()
  const startTomorrow = startOfZonedDay(tomorrow, ctx.timeZone) ?? addDays(startToday, 1)
  const now = new Date()

  const [agenda, sent, unsent, paid, owed] = await Promise.all([
    listAgenda(ctx.userId, ctx.profile.calendarUrl, startToday, addDays(startTomorrow, 1)),
    sql().query("SELECT category, count(*)::int AS n FROM drafts WHERE user_id = $1 AND sent_at >= $2 GROUP BY category", [ctx.userId, startToday.toISOString()]) as unknown as Promise<{ category: string; n: number }[]>,
    sql().query('SELECT count(*)::int AS n FROM drafts WHERE user_id = $1 AND sent_at IS NULL', [ctx.userId]) as unknown as Promise<{ n: number }[]>,
    sql().query('SELECT count(*)::int AS n, COALESCE(sum(total_cents), 0)::text AS cents FROM invoices WHERE user_id = $1 AND paid_at >= $2', [ctx.userId, startToday.toISOString()]) as unknown as Promise<{ n: number; cents: string }[]>,
    moneyOwed(ctx.userId, today),
  ])

  // Reminders to send a draft are agenda lines too, but they are not jobs: only real items count as done or coming up.
  const items = agenda.items.filter((item) => item.source !== 'draft')
  const todays = items.filter((item) => new Date(item.startsAt) < startTomorrow)
  const tomorrowFirst = items.find((item) => new Date(item.startsAt) >= startTomorrow)
  return JSON.stringify({
    doneToday: todays.filter((item) => new Date(item.startsAt) < now).map((item) => item.title),
    stillToday: todays.filter((item) => new Date(item.startsAt) >= now).map((item) => `${item.title}, ${formatWhen(item.startsAt, ctx.timeZone, item.allDay)}`),
    quotesSentToday: sent.find((row) => row.category === 'QUOTE')?.n ?? 0,
    otherMessagesSentToday: sent.filter((row) => row.category !== 'QUOTE').reduce((sum, row) => sum + row.n, 0),
    draftsNotSentYet: unsent[0]?.n ?? 0,
    paidToday: { count: paid[0]?.n ?? 0, total: formatRand(Number(paid[0]?.cents ?? 0)) },
    stillOwed: formatRand(owed.owedCents),
    overdue: formatRand(owed.overdueCents),
    tomorrowFirstJob: tomorrowFirst ? `${tomorrowFirst.title}, ${formatWhen(tomorrowFirst.startsAt, ctx.timeZone, tomorrowFirst.allDay)}` : 'nothing booked yet',
    note: 'Wrap up in three or four spoken sentences: what got done, money in and owed, and the first job tomorrow.',
  })
}

/** Runs a summary tool, or returns null when the name belongs to another group of tools. */
export async function runSummaryTool(name: string, args: unknown, ctx: ToolContext): Promise<string | null> {
  if (name === 'money_summary') return moneySummary(args, ctx)
  if (name === 'day_wrap') return dayWrap(ctx)
  return null
}
