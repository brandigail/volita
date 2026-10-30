import { neon } from '@neondatabase/serverless'
import { planLimits, type PlanId } from '../../../src/types/plans.ts'
import { openText } from './crypto.ts'
import { describeError } from './safe-log.ts'

const MAX_SERVICES = 60

export interface ServiceRow {
  id: string
  name: string
  price: string
  note: string
  created_at: string | Date
}

/** The user's saved prices as prompt text, or empty if the plan has no price list or none are saved. A failure never stops a draft. */
export async function loadPriceContext(userId: string, plan: PlanId): Promise<string> {
  if (!planLimits(plan).priceList) return ''
  try {
    const sql = neon(process.env.DATABASE_URL ?? '')
    const rows = (await sql.query(
      `SELECT id, name, price, note, created_at FROM services WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${MAX_SERVICES}`,
      [userId],
    )) as ServiceRow[]
    return rows
      .map((row) => {
        const note = openText(userId, 'services.note', row.note)
        return `- ${openText(userId, 'services.name', row.name)}: ${openText(userId, 'services.price', row.price)}${note ? ` (${note})` : ''}`
      })
      .join('\n')
  } catch (err) {
    console.error('Could not load the price list:', describeError(err))
    return ''
  }
}
