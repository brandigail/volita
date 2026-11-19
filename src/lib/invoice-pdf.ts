import type { BusinessSettings, Invoice } from '../types/business'
import type { Profile } from '../types/profile'
import { prettyDate } from './invoice-text'
import { formatRand, lineCents } from './money'

const MARGIN = 18
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const RIGHT = PAGE_WIDTH - MARGIN
// Column positions, in millimetres from the left edge: description, quantity, price, line total (the last two are right aligned).
const COLUMN = { qty: 118, price: 150, total: RIGHT }

/** Builds a clean invoice PDF in the browser (nothing is uploaded). A VAT registered business prints "TAX INVOICE" with its VAT number, as the law asks. */
export async function buildInvoicePdf(invoice: Invoice, settings: BusinessSettings, profile: Profile): Promise<File> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  const text = (value: string, x: number, size = 11, bold = false, align: 'left' | 'right' = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.text(value, x, y, { align })
  }
  const line = (value: string, size = 11, bold = false, gap = 6) => {
    for (const part of doc.splitTextToSize(value, RIGHT - MARGIN) as string[]) {
      if (y > PAGE_HEIGHT - MARGIN) {
        doc.addPage()
        y = MARGIN
      }
      text(part, MARGIN, size, bold)
      y += gap
    }
  }

  const business = profile.businessName || profile.name
  if (business) line(business, 18, true, 8)
  const contact = [profile.name !== business ? profile.name : '', profile.phone, settings.vatRegistered && settings.vatNumber ? `VAT no. ${settings.vatNumber}` : ''].filter(Boolean).join('  ·  ')
  if (contact) line(contact, 10, false, 5)
  y += 4
  doc.setDrawColor(180)
  doc.line(MARGIN, y, RIGHT, y)
  y += 9

  line(settings.vatRegistered ? 'TAX INVOICE' : 'INVOICE', 20, true, 9)
  line(`Invoice number: ${invoice.number}`, 11, true, 5.5)
  line(`Date: ${prettyDate(invoice.issuedOn)}`, 11, false, 5.5)
  line(`Payment due: ${prettyDate(invoice.dueOn)}`, 11, false, 9)
  line('Billed to', 10, true, 5)
  line([invoice.customerName, invoice.customerPhone, invoice.customerEmail].filter(Boolean).join('\n'), 11, false, 5.5)
  y += 6

  doc.setFillColor(238, 238, 238)
  doc.rect(MARGIN, y - 5, RIGHT - MARGIN, 8, 'F')
  text('Description', MARGIN + 2, 10, true)
  text('Qty', COLUMN.qty, 10, true, 'right')
  text('Price', COLUMN.price, 10, true, 'right')
  text('Amount', COLUMN.total, 10, true, 'right')
  y += 9

  for (const item of invoice.items) {
    const description = doc.splitTextToSize(item.description, COLUMN.qty - MARGIN - 18) as string[]
    if (y + description.length * 5 > PAGE_HEIGHT - 60) {
      doc.addPage()
      y = MARGIN
    }
    text(description[0], MARGIN + 2)
    text(String(item.quantity), COLUMN.qty, 11, false, 'right')
    text(formatRand(item.unitCents), COLUMN.price, 11, false, 'right')
    text(formatRand(lineCents(item)), COLUMN.total, 11, false, 'right')
    for (const extra of description.slice(1)) {
      y += 5
      text(extra, MARGIN + 2)
    }
    y += 7
  }

  doc.line(MARGIN, y - 3, RIGHT, y - 3)
  y += 3
  const total = (label: string, value: string, bold = false) => {
    text(label, COLUMN.price, 11, bold, 'right')
    text(value, COLUMN.total, bold ? 13 : 11, bold, 'right')
    y += bold ? 9 : 6
  }
  total(settings.vatRegistered ? 'Subtotal (excl. VAT)' : 'Subtotal', formatRand(invoice.subtotalCents))
  if (invoice.vatRate > 0) total(`VAT ${invoice.vatRate}%`, formatRand(invoice.vatCents))
  total('Total due', formatRand(invoice.totalCents), true)

  y += 6
  if (settings.bankDetails) {
    line('How to pay', 10, true, 5)
    line(`${settings.bankDetails}\nReference: ${invoice.number}`, 11, false, 5.5)
    y += 3
  }
  if (invoice.note) line(invoice.note, 10, false, 5)
  if (settings.invoiceNote) line(settings.invoiceNote, 10, false, 5)

  return new File([doc.output('blob')], `invoice-${invoice.number.toLowerCase()}.pdf`, { type: 'application/pdf' })
}
