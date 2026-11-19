import type { Profile } from '../types/profile'

const MARGIN = 18
const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const GAP = 6
const COLUMN_WIDTH = (PAGE_WIDTH - MARGIN * 2 - GAP) / 2

export interface JobSheet {
  customer: string
  /** Free text: what was done, in the owner's words. */
  work: string
  /** JPEG data URLs, already shrunk. */
  photos: string[]
  /** YYYY-MM-DD of the job. */
  date: string
}

/** Builds a job report PDF on the phone (nothing is uploaded): who it was for, what was done, and the photos, two to a row. */
export async function buildJobSheetPdf(sheet: JobSheet, profile: Profile): Promise<File> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  const line = (text: string, size: number, bold = false, gap = 6) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    for (const part of doc.splitTextToSize(text, PAGE_WIDTH - MARGIN * 2) as string[]) {
      if (y > PAGE_HEIGHT - MARGIN) {
        doc.addPage()
        y = MARGIN
      }
      doc.text(part, MARGIN, y)
      y += gap
    }
  }

  const business = profile.businessName || profile.name
  if (business) line(business, 18, true, 8)
  const contact = [profile.name !== business ? profile.name : '', profile.phone].filter(Boolean).join('  ·  ')
  if (contact) line(contact, 10, false, 5)
  y += 4
  doc.setDrawColor(180)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 9

  line('JOB REPORT', 20, true, 9)
  line(`For: ${sheet.customer}`, 11, true, 5.5)
  line(`Date: ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${sheet.date}T00:00:00Z`))}`, 11, false, 9)
  line('Work done', 12, true, 6)
  line(sheet.work, 11, false, 5.5)
  y += 6

  let column = 0
  let rowHeight = 0
  for (const photo of sheet.photos) {
    const { width, height } = doc.getImageProperties(photo)
    const photoHeight = (COLUMN_WIDTH * height) / width
    if (column === 0 && y + photoHeight > PAGE_HEIGHT - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
    doc.addImage(photo, 'JPEG', MARGIN + column * (COLUMN_WIDTH + GAP), y, COLUMN_WIDTH, photoHeight)
    rowHeight = Math.max(rowHeight, photoHeight)
    column += 1
    if (column === 2) {
      column = 0
      y += rowHeight + GAP
      rowHeight = 0
    }
  }

  return new File([doc.output('blob')], `job-report-${sheet.customer.replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`, { type: 'application/pdf' })
}
