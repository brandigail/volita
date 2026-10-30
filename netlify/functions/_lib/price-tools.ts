import { neon } from '@neondatabase/serverless'
import { z } from 'zod'
import { PRICE_LIMITS } from '../../../src/types/pricing.ts'
import type { ToolContext } from './assistant-tools.ts'
import { encryptText, openText } from './crypto.ts'
import type { ToolDefinition } from './groq-chat.ts'
import { loadPriceContext } from './price-context.ts'

export const PRICE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_prices',
      description: "The user's saved price list (services and what they charge). Call it before writing a quote, and when they ask what they charge for something.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_price',
      description: 'Save or update the price of one service in their price list, after they told you the price (or asked you to keep it for next time).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The service or item, for example "Bathroom retiling per square metre".' },
          price: { type: 'string', description: 'The price as they said it, for example "R450 per m2".' },
          note: { type: 'string', description: 'Optional detail, for example "materials not included".' },
        },
        required: ['name', 'price'],
      },
    },
  },
]

const saveArgs = z.object({
  name: z.string().trim().min(1).max(PRICE_LIMITS.name),
  price: z.string().trim().min(1).max(PRICE_LIMITS.price),
  note: z.string().trim().max(PRICE_LIMITS.note).optional(),
})

const fail = (message: string) => JSON.stringify({ error: message })

interface ServiceKey {
  id: string
  name: string
}

/** Runs a price tool, or returns null when the name belongs to another group of tools. */
export async function runPriceTool(name: string, args: unknown, ctx: ToolContext): Promise<string | null> {
  if (name === 'get_prices') {
    const prices = await loadPriceContext(ctx.userId, ctx.plan)
    return JSON.stringify({ prices: prices || 'The price list is empty.' })
  }
  if (name !== 'save_price') return null
  const parsed = saveArgs.safeParse(args)
  if (!parsed.success) return fail('Give the item and its price.')
  const sql = neon(process.env.DATABASE_URL ?? '')
  const existing = (await sql.query('SELECT id, name FROM services WHERE user_id = $1', [ctx.userId])) as ServiceKey[]
  const match = existing.find((row) => openText(ctx.userId, 'services.name', row.name).toLowerCase() === parsed.data.name.toLowerCase())
  const price = encryptText(ctx.userId, 'services.price', parsed.data.price)
  const note = encryptText(ctx.userId, 'services.note', parsed.data.note ?? '')
  if (match) {
    await sql.query('UPDATE services SET price = $3, note = $4 WHERE id = $1 AND user_id = $2', [match.id, ctx.userId, price, note])
    return JSON.stringify({ updated: true })
  }
  if (existing.length >= PRICE_LIMITS.items) return fail(`The price list is full (${PRICE_LIMITS.items} items).`)
  await sql.query('INSERT INTO services (user_id, name, price, note) VALUES ($1, $2, $3, $4)', [
    ctx.userId,
    encryptText(ctx.userId, 'services.name', parsed.data.name),
    price,
    note,
  ])
  return JSON.stringify({ saved: true })
}
