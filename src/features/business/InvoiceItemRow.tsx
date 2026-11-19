import { Trash2 } from 'lucide-react'
import { formatRand } from '../../lib/money'
import type { PriceNote } from '../../lib/price-memory'
import { BUSINESS_LIMITS } from '../../types/business'

export interface Row {
  description: string
  quantity: string
  price: string
}

interface InvoiceItemRowProps {
  index: number
  row: Row
  /** Set when the price differs from what was charged for this item last time. */
  note: PriceNote | null
  canRemove: boolean
  onChange: (patch: Partial<Row>) => void
  onRemove: () => void
}

/** One line of an invoice: what, how many, the price each, and a gentle note when the price is not what it was last time. */
export function InvoiceItemRow({ index, row, note, canRemove, onChange, onRemove }: InvoiceItemRowProps) {
  const n = index + 1
  return (
    <div>
      <div className="grid grid-cols-[1fr_4rem_6.5rem_2.75rem] items-center gap-2">
        <input aria-label={`Item ${n} description`} className="field" placeholder="What" value={row.description} maxLength={BUSINESS_LIMITS.description} onChange={(e) => onChange({ description: e.target.value })} />
        <input aria-label={`Item ${n} quantity`} className="field px-2 text-center" inputMode="decimal" value={row.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
        <input aria-label={`Item ${n} price`} className="field px-2 text-right" inputMode="decimal" placeholder="R 0.00" value={row.price} onChange={(e) => onChange({ price: e.target.value })} />
        <button type="button" aria-label={`Remove item ${n}`} disabled={!canRemove} onClick={onRemove} className="btn btn-ghost px-0">
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      {note && (
        <p className="muted mt-1 text-xs" role="status">
          Last time ({note.number}) you charged {formatRand(note.unitCents)}; this is {Math.abs(note.changePercent)}% {note.changePercent > 0 ? 'more' : 'less'}.{' '}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => onChange({ price: (note.unitCents / 100).toFixed(2) })}>
            Use last price
          </button>
        </p>
      )}
    </div>
  )
}
