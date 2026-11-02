import type { GeneratedDraft } from '../types/draft'
import type { Profile } from '../types/profile'

const MARGIN = 18
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const LINE_HEIGHT = 6

/** Builds a plain, clean quote PDF in the browser (nothing is uploaded) and returns it as a file ready to download or share. */
export async function buildQuotePdf(draft: GeneratedDraft, profile: Profile): Promise<File> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = PAGE_WIDTH - MARGIN * 2
  let y = MARGIN

  const write = (text: string, size: number, bold = false, gap = LINE_HEIGHT) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      if (y > PAGE_HEIGHT - MARGIN) {
        doc.addPage()
        y = MARGIN
      }
      doc.text(line, MARGIN, y)
      y += gap
    }
  }

  const business = profile.businessName || profile.name
  if (business) write(business, 18, true, 8)
  const contact = [profile.name !== business ? profile.name : '', profile.phone].filter(Boolean).join('  ·  ')
  if (contact) write(contact, 10, false, 5)
  y += 4
  doc.setDrawColor(180)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 8

  write('QUOTE', 20, true, 9)
  if (draft.subject) write(draft.subject, 12, true)
  if (draft.recipient) write(`Prepared for: ${draft.recipient}`, 11)
  write(`Date: ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date())}`, 11, false, 8)

  write(draft.body, 11)
  return new File([doc.output('blob')], `quote-${(draft.recipient || 'volita').replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`, { type: 'application/pdf' })
}

/** Shares the PDF with the device share sheet when it can, otherwise downloads it. */
export async function deliverPdf(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return
    } catch {
      // dismissed, or sharing refused: fall through to a download
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}
