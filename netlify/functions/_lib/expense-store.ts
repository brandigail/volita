import { neon } from '@neondatabase/serverless'
import { EXPENSE_LIMITS, type Expense, type ExpenseInput } from '../../../src/types/scan.ts'
import { encryptText, openText } from './crypto.ts'

const sql = () => neon(process.env.DATABASE_URL ?? '')

interface ExpenseRow {
  id: string
  spent_on: string
  supplier: string
  note: string
  total_cents: string | number
  vat_cents: string | number
  created_at: string | Date
}

const COLUMNS = 'id, spent_on::text AS spent_on, supplier, note, total_cents, vat_cents, created_at'

const toExpense = (userId: string, row: ExpenseRow): Expense => ({
  id: row.id,
  spentOn: row.spent_on,
  supplier: openText(userId, 'expenses.supplier', row.supplier),
  note: openText(userId, 'expenses.note', row.note),
  totalCents: Number(row.total_cents),
  vatCents: Number(row.vat_cents),
  createdAt: new Date(row.created_at).toISOString(),
})

/** The person's expenses, newest first. Who and what is stored scrambled; amounts and dates are not, so they can be added up. */
export async function listExpenses(userId: string): Promise<Expense[]> {
  const rows = (await sql().query(`SELECT ${COLUMNS} FROM expenses WHERE user_id = $1 ORDER BY spent_on DESC, created_at DESC LIMIT ${EXPENSE_LIMITS.perUser}`, [userId])) as ExpenseRow[]
  return rows.map((row) => toExpense(userId, row))
}

export type CreateExpenseResult = { ok: true; expense: Expense } | { ok: false; message: string }

export async function createExpense(userId: string, input: ExpenseInput): Promise<CreateExpenseResult> {
  if (input.vatCents > input.totalCents) return { ok: false, message: 'The VAT cannot be more than the total.' }
  const [{ total }] = (await sql().query('SELECT count(*)::int AS total FROM expenses WHERE user_id = $1', [userId])) as { total: number }[]
  if (total >= EXPENSE_LIMITS.perUser) return { ok: false, message: `You already have ${EXPENSE_LIMITS.perUser} expenses saved. Delete some old ones first.` }
  const [row] = (await sql().query(
    `INSERT INTO expenses (user_id, spent_on, supplier, note, total_cents, vat_cents) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
    [userId, input.spentOn, encryptText(userId, 'expenses.supplier', input.supplier), encryptText(userId, 'expenses.note', input.note), input.totalCents, input.vatCents],
  )) as ExpenseRow[]
  return { ok: true, expense: toExpense(userId, row) }
}

export async function deleteExpense(userId: string, id: string): Promise<boolean> {
  return (await sql().query('DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId])).length > 0
}
