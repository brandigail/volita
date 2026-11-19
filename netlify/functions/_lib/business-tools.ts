import { z } from 'zod'
import { chaseMarkerFor, chaserMessage, reviewMessage } from '../../../src/lib/business-messages.ts'
import { plain } from '../../../src/lib/customer-match.ts'
import { daysBetween, formatRand, nextChase } from '../../../src/lib/money.ts'
import { toInternationalNumber } from '../../../src/lib/phone.ts'
import type { Invoice, InvoiceStatus } from '../../../src/types/business.ts'
import type { Contact } from '../../../src/types/memory.ts'
import { planLimits } from '../../../src/types/plans.ts'
import type { ToolContext } from './assistant-tools.ts'
import { createInvoice, findInvoiceByNumber, getSettings, listInvoices, moneyOwed, patchInvoice } from './business-store.ts'
import { spokenReply } from './chat-tools.ts'
import { loadActivitySource, summarise, timelineFor } from './customer-timeline.ts'
import { saveDraftRow } from './draft-saver.ts'
import type { ToolDefinition } from './groq-chat.ts'
import { listContacts } from './memory-store.ts'
import { formatWhen, todayIn } from './time.ts'

/**
 * The assistant's money tools. They read the books, make an invoice as a draft, mark one paid, and write a payment reminder or a review
 * request for the owner to approve. None of them sends anything to a customer: a reminder waits for the owner's "send it".
 */

export const BUSINESS_TOOL_NAMES = new Set(['customer_story', 'money_owed', 'create_invoice', 'mark_invoice_paid', 'chase_payment', 'ask_for_review'])

/** Words that suggest the money tools are needed. They are only shown to the model then, because every tool costs tokens on every call. */
const BUSINESS_WORDS = /\b(invoice|invoices|owe|owes|owed|outstanding|overdue|paid|payment|payments|pay|chase|remind|reminder|customer|customers|client|story|review|reviews|bill|billed|unpaid|vat)\b/i

/** Whether this turn (the latest words and a little of what came before) is about money or customers. */
export const wantsBusinessTools = (recentText: string): boolean => BUSINESS_WORDS.test(recentText)

export const BUSINESS_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'customer_story',
      description: 'What has happened with one customer: what they owe, and their recent quotes, messages, meetings and invoices. Use for "what is the story with Mrs Naidoo", "what has she owed me", "when did I last talk to Sipho".',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'money_owed',
      description: 'The invoices waiting to be paid, and which are overdue. Use for "who owes me money", "what is outstanding", "who is late".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description:
        'Make an invoice as a draft (it is NOT sent). Prices are rand per unit WITHOUT VAT; VAT is added if the business is VAT registered. Use when the user says "invoice Mrs Naidoo for the geyser, 4800". Tell them the number and total, and that it is in the Business tab to send.',
      parameters: {
        type: 'object',
        properties: {
          customer: { type: 'string' },
          items: {
            type: 'array',
            items: { type: 'object', properties: { description: { type: 'string' }, quantity: { type: 'number' }, price: { type: 'number', description: 'Rand per unit, no VAT.' } }, required: ['description', 'price'] },
          },
          vat: { type: 'boolean', description: 'Only when the user says to add or leave out VAT; otherwise leave it out.' },
        },
        required: ['customer', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_invoice_paid',
      description: 'Mark a sent invoice as paid, when the user says a customer has paid. Give the invoice number ("INV-0007") or the customer name.',
      parameters: { type: 'object', properties: { invoice: { type: 'string' } }, required: ['invoice'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'chase_payment',
      description:
        'Write the next payment reminder for an overdue invoice and put it on screen for the user to approve (friendly after 7 days late, firmer after 14, final after 30). Nothing is sent: WhatsApp opens only when the user says "send it". Give the invoice number or the customer name.',
      parameters: { type: 'object', properties: { invoice: { type: 'string' } }, required: ['invoice'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_for_review',
      description: 'Write a message asking a happy customer for a Google review and put it on screen for the user to approve. Nothing is sent until the user says "send it".',
      parameters: { type: 'object', properties: { customer: { type: 'string' } }, required: ['customer'] },
    },
  },
]

const fail = (message: string) => JSON.stringify({ error: message })
const nameArgs = z.object({ name: z.string().trim().min(1).max(100) })
const invoiceArgs = z.object({ invoice: z.string().trim().min(1).max(100) })
const customerArgs = z.object({ customer: z.string().trim().min(1).max(100) })
const createArgs = z.object({
  customer: z.string().trim().min(1).max(100),
  items: z
    .array(z.object({ description: z.string().trim().min(1).max(200), quantity: z.number().positive().max(100_000).default(1), price: z.number().min(0).max(100_000_000) }))
    .min(1)
    .max(30),
  vat: z.boolean().optional(),
})

const sameName = (a: string, b: string) => {
  const x = plain(a)
  const y = plain(b)
  return x.length > 0 && y.length > 0 && (x === y || x.includes(y) || y.includes(x))
}

async function findContact(ctx: ToolContext, name: string): Promise<{ contact?: Contact; ambiguous?: string[] }> {
  const matches = (await listContacts(ctx.userId)).filter((person) => sameName(person.name, name))
  const exact = matches.filter((person) => plain(person.name) === plain(name))
  const chosen = exact.length > 0 ? exact : matches
  return chosen.length > 1 ? { ambiguous: chosen.map((person) => person.name) } : { contact: chosen[0] }
}

type Resolved = { ok: true; invoice: Invoice } | { ok: false; message: string }

/** Finds the one invoice the user means: by number, or the only one with that status for that customer. */
async function resolveInvoice(ctx: ToolContext, text: string, status: InvoiceStatus): Promise<Resolved> {
  const byNumber = /\d/.test(text) && /inv|^\s*\d+\s*$/i.test(text) ? await findInvoiceByNumber(ctx.userId, text) : null
  if (byNumber) return byNumber.status === status ? { ok: true, invoice: byNumber } : { ok: false, message: `${byNumber.number} is ${byNumber.status.toLowerCase()}, not ${status.toLowerCase()}.` }
  const matches = (await listInvoices(ctx.userId, status)).filter((invoice) => sameName(invoice.customerName, text))
  if (matches.length === 0) return { ok: false, message: `There is no ${status.toLowerCase()} invoice for "${text}".` }
  if (matches.length > 1) return { ok: false, message: `More than one matches: ${matches.map((invoice) => `${invoice.number} (${formatRand(invoice.totalCents)})`).join(', ')}. Ask which one.` }
  return { ok: true, invoice: matches[0] }
}

async function customerStory(args: unknown, ctx: ToolContext): Promise<string> {
  const parsed = nameArgs.safeParse(args)
  if (!parsed.success) return fail('Give the customer name.')
  const found = await findContact(ctx, parsed.data.name)
  if (found.ambiguous) return fail(`More than one saved person matches: ${found.ambiguous.join(', ')}. Ask which one.`)
  const now = new Date()
  const contact: Contact = found.contact ?? { id: '', name: parsed.data.name, email: '', phone: '', relationship: '', notes: '', createdAt: now.toISOString(), updatedAt: now.toISOString() }
  const [invoices, source] = await Promise.all([listInvoices(ctx.userId), loadActivitySource(ctx.userId, now)])
  const timeline = timelineFor(contact, invoices, source)
  if (timeline.length === 0 && !found.contact) return fail(`Nothing is saved for "${parsed.data.name}": no saved person, quote, message, meeting or invoice. Say so.`)
  const summary = summarise(contact, invoices, timeline)
  return JSON.stringify({
    customer: contact.name,
    owes: summary.owedCents > 0 ? formatRand(summary.owedCents) : 'nothing',
    notes: contact.notes || undefined,
    recent: timeline.slice(0, 8).map((entry) => `${formatWhen(entry.at, ctx.timeZone, false)}: ${entry.title}. ${entry.detail}`),
    note: 'These come from the user\'s own records. Tell the story in a few spoken sentences, newest first.',
  })
}

async function moneyOwedTool(ctx: ToolContext): Promise<string> {
  const owed = await moneyOwed(ctx.userId, todayIn(ctx.timeZone))
  if (owed.owedCents === 0) return JSON.stringify({ owed: 'nothing', note: 'No sent invoice is waiting to be paid.' })
  return JSON.stringify({
    totalOwed: formatRand(owed.owedCents),
    overdueTotal: formatRand(owed.overdueCents),
    overdue: owed.overdue.slice(0, 10).map(({ invoice, daysOverdue }) => ({ number: invoice.number, customer: invoice.customerName, amount: formatRand(invoice.totalCents), daysOverdue, remindersSent: invoice.remindersSent })),
  })
}

async function createInvoiceTool(args: unknown, ctx: ToolContext): Promise<string> {
  const parsed = createArgs.safeParse(args)
  if (!parsed.success) return fail('Give the customer and at least one item with a price in rand.')
  const settings = await getSettings(ctx.userId)
  const found = await findContact(ctx, parsed.data.customer)
  if (found.ambiguous) return fail(`More than one saved person matches: ${found.ambiguous.join(', ')}. Ask which one.`)
  const vatRate = (parsed.data.vat ?? settings.vatRegistered) ? 15 : 0
  const made = await createInvoice(
    ctx.userId,
    {
      customerName: found.contact?.name ?? parsed.data.customer,
      customerPhone: found.contact?.phone ?? '',
      customerEmail: found.contact?.email ?? '',
      contactId: found.contact?.id ?? null,
      items: parsed.data.items.map((item) => ({ description: item.description, quantity: item.quantity, unitCents: Math.round(item.price * 100) })),
      vatRate,
      note: '',
    },
    settings,
    todayIn(ctx.timeZone),
  )
  if (!made.ok) return fail(made.message)
  const { invoice } = made
  ctx.actions.push({ type: 'invoice_ready', id: invoice.id, label: `${invoice.number} for ${invoice.customerName}, ${formatRand(invoice.totalCents)}` })
  return JSON.stringify({
    made: true,
    number: invoice.number,
    customer: invoice.customerName,
    total: formatRand(invoice.totalCents),
    vatIncluded: invoice.vatCents > 0,
    dueOn: invoice.dueOn,
    note: settings.bankDetails ? 'It is a draft in the Business tab, ready to send as a PDF or on WhatsApp.' : 'It is a draft in the Business tab. Their bank details are not set up yet; tell them to add them under My details before sending.',
  })
}

async function markPaidTool(args: unknown, ctx: ToolContext): Promise<string> {
  const parsed = invoiceArgs.safeParse(args)
  if (!parsed.success) return fail('Give the invoice number or the customer name.')
  const found = await resolveInvoice(ctx, parsed.data.invoice, 'SENT')
  if (!found.ok) return fail(found.message)
  const paid = await patchInvoice(ctx.userId, found.invoice.id, { status: 'PAID' })
  if (!paid.ok) return fail(paid.message)
  ctx.actions.push({ type: 'invoice_paid', id: paid.invoice.id, label: `${paid.invoice.number}, ${formatRand(paid.invoice.totalCents)}` })
  return JSON.stringify({ paid: true, number: paid.invoice.number, customer: paid.invoice.customerName, amount: formatRand(paid.invoice.totalCents), note: 'Offer to ask them for a review.' })
}

async function chasePaymentTool(args: unknown, ctx: ToolContext): Promise<string> {
  const parsed = invoiceArgs.safeParse(args)
  if (!parsed.success) return fail('Give the invoice number or the customer name.')
  const found = await resolveInvoice(ctx, parsed.data.invoice, 'SENT')
  if (!found.ok) return fail(found.message)
  const { invoice } = found
  const today = todayIn(ctx.timeZone)
  const late = daysBetween(invoice.dueOn, today)
  const stage = nextChase(Math.max(0, late), invoice.remindersSent)
  if (stage === null) {
    return JSON.stringify({ reminded: false, note: late <= 0 ? `${invoice.number} is not overdue yet (due ${invoice.dueOn}).` : invoice.remindersSent >= 3 ? 'All three reminders were already sent. Suggest phoning the customer.' : `Too soon for the next reminder; ${invoice.number} is ${late} days late and the next one is due later.` })
  }

  const message = chaserMessage(stage, invoice, ctx.profile, today)
  const phone = invoice.customerPhone ? toInternationalNumber(invoice.customerPhone) : ''
  const toEmail = !phone && invoice.customerEmail !== ''
  const saved = await saveDraftRow(
    ctx.userId,
    { category: toEmail ? 'EMAIL' : 'WHATSAPP', recipient: phone || invoice.customerEmail || invoice.customerName, subject: toEmail ? message.subject : '', body: message.body, language: 'en' },
    chaseMarkerFor(invoice.id),
  )
  if (!saved.ok) return fail(saved.message)

  if (toEmail) {
    ctx.actions.push({ type: 'draft_created', id: saved.id, category: 'EMAIL', label: `Payment reminder to ${invoice.customerName}` })
    return JSON.stringify({ prepared: true, to: invoice.customerName, note: 'There is no WhatsApp number, so the reminder is an email saved in History for them to send from their mail app.' })
  }
  ctx.actions.push({ type: 'reply_ready', id: saved.id, label: `WhatsApp to ${invoice.customerName}` })
  const body = message.body.slice(0, message.body.lastIndexOf('\n\n')).trimEnd()
  ctx.directReply = spokenReply(invoice.customerName, body)
  return JSON.stringify({ prepared: true, to: invoice.customerName, reminder: stage, knowsNumber: phone !== '' })
}

async function askForReviewTool(args: unknown, ctx: ToolContext): Promise<string> {
  const parsed = customerArgs.safeParse(args)
  if (!parsed.success) return fail('Give the customer name.')
  const settings = await getSettings(ctx.userId)
  if (!settings.reviewLink) return fail('They have not added their Google review link yet. Tell them to add it in the Business tab under My details.')
  const found = await findContact(ctx, parsed.data.customer)
  if (found.ambiguous) return fail(`More than one saved person matches: ${found.ambiguous.join(', ')}. Ask which one.`)
  const paid = (await listInvoices(ctx.userId, 'PAID')).find((invoice) => sameName(invoice.customerName, parsed.data.customer))
  const name = found.contact?.name ?? paid?.customerName ?? parsed.data.customer
  const phone = found.contact?.phone || paid?.customerPhone || ''
  const message = reviewMessage(name, settings.reviewLink, ctx.profile)
  const saved = await saveDraftRow(ctx.userId, { category: 'WHATSAPP', recipient: phone ? toInternationalNumber(phone) : name, subject: '', body: message.body, language: 'en' }, `Ask ${name} for a review`)
  if (!saved.ok) return fail(saved.message)
  ctx.actions.push({ type: 'reply_ready', id: saved.id, label: `WhatsApp to ${name}` })
  ctx.directReply = spokenReply(name, message.body.slice(0, message.body.lastIndexOf('\n\n')).trimEnd())
  return JSON.stringify({ prepared: true, to: name, knowsNumber: phone !== '' })
}

/** Runs a money tool, or returns null when the name belongs to another group of tools. */
export async function runBusinessTool(name: string, args: unknown, ctx: ToolContext): Promise<string | null> {
  if (!BUSINESS_TOOL_NAMES.has(name)) return null
  if (!planLimits(ctx.plan).business) return fail('The Business tab is part of the Pro plan. Tell them kindly.')
  switch (name) {
    case 'customer_story':
      return customerStory(args, ctx)
    case 'money_owed':
      return moneyOwedTool(ctx)
    case 'create_invoice':
      return createInvoiceTool(args, ctx)
    case 'mark_invoice_paid':
      return markPaidTool(args, ctx)
    case 'chase_payment':
      return chasePaymentTool(args, ctx)
    default:
      return askForReviewTool(args, ctx)
  }
}
