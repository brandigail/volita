import { plain, phoneTail } from './customer-match'
import { toInternationalNumber } from './phone'

// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** Only what Volita needs from an address book: a name, a number and an email. Nothing else is read or kept. */
export interface ImportedContact {
  name: string
  phone: string
  email: string
}

/** Most contacts read from one file; a bigger address book is imported in more than one go. */
export const MAX_IMPORT = 500

/** A South African number written the local way becomes +27…; anything with fewer than 7 digits is not a phone number. */
export function normalizeNumber(raw: string): string {
  const cleaned = raw.replace(/^tel:/i, '').trim()
  if (cleaned.replace(/\D/g, '').length < 7) return ''
  const international = toInternationalNumber(cleaned)
  return /^\+\d{7,15}$/.test(international) ? international : cleaned.replace(/[^\d+]/g, '').slice(0, 40)
}

const tidyName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, 100)
/** A "name" that is really a number (some phones store unnamed numbers that way) is not worth importing. */
const looksLikeNumber = (name: string): boolean => name.replace(/\D/g, '').length >= 7 && !/\p{L}/u.test(name)

function finish(name: string, phone: string, email: string): ImportedContact | null {
  const clean = tidyName(name)
  const contact = { name: clean, phone: normalizeNumber(phone), email: email.trim().toLowerCase().slice(0, 200) }
  if (clean === '' || looksLikeNumber(clean) || (contact.phone === '' && contact.email === '')) return null
  return contact
}

const unescapeVcf = (value: string): string => value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1')

/** Reads a .vcf file (what an iPhone or Android phone shares from Contacts). Several cards can be in one file. */
export function parseVcf(text: string): ImportedContact[] {
  const unfolded = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '')
  const found: ImportedContact[] = []
  for (const block of unfolded.split(/^BEGIN:VCARD/im).slice(1)) {
    let full = ''
    let parts: string[] = []
    const phones: { value: string; mobile: boolean }[] = []
    let email = ''
    for (const line of block.split('\n')) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const head = line.slice(0, colon).toUpperCase()
      const key = head.split(';')[0].replace(/^ITEM\d+\./, '')
      const value = unescapeVcf(line.slice(colon + 1).trim())
      if (key === 'FN') full = value
      else if (key === 'N') parts = value.split(';').map((part) => part.trim())
      else if (key === 'TEL') phones.push({ value, mobile: /CELL|MOBILE/.test(head) })
      else if (key === 'EMAIL' && email === '') email = value
    }
    // N is family;given;additional;prefix;suffix.
    const built = [parts[3], parts[1], parts[2], parts[0], parts[4]].filter(Boolean).join(' ')
    const phone = (phones.find((item) => item.mobile) ?? phones[0])?.value ?? ''
    const contact = finish(full || built, phone, email)
    if (contact) found.push(contact)
  }
  return found
}

/** Splits CSV text into rows, handling quoted fields that hold commas, quotes or line breaks. */
function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',' || char === ';') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

const matching = (headers: string[], test: (header: string) => boolean): number[] => headers.flatMap((header, index) => (test(header) ? [index] : []))

/** Reads a .csv export from Google Contacts, Outlook or iCloud. Columns are found by their headings. */
export function parseCsv(text: string): ImportedContact[] {
  const [header, ...rows] = csvRows(text.replace(/^\uFEFF/, ''))
  if (!header) return []
  const headers = header.map((cell) => cell.trim().toLowerCase())
  const first = matching(headers, (h) => h === 'first name' || h === 'given name')[0]
  const last = matching(headers, (h) => h === 'last name' || h === 'family name' || h === 'surname')[0]
  const whole = matching(headers, (h) => h === 'name' || h === 'full name' || h === 'display name' || h === 'file as')[0]
  const phoneColumns = matching(headers, (h) => (h.includes('phone') || h.includes('mobile') || h === 'cell') && !h.includes('label') && !h.includes('type') && !h.includes('phonetic'))
  const emailColumns = matching(headers, (h) => (h.includes('e-mail') || h.includes('email')) && !h.includes('label') && !h.includes('type') && !h.includes('display'))
  const pick = (cells: string[], columns: number[]) => columns.map((index) => cells[index]?.trim() ?? '').find((cell) => cell !== '') ?? ''

  const found: ImportedContact[] = []
  for (const cells of rows) {
    const joined = [first, last].map((index) => (index === undefined ? '' : (cells[index] ?? '').trim())).filter(Boolean).join(' ')
    const name = joined || (whole === undefined ? '' : (cells[whole] ?? '').trim())
    // Several numbers may be listed in one cell, separated by " ::: " (Google) or a semicolon.
    const phone = pick(cells, phoneColumns).split(/\s*:::\s*|\s*;\s*/)[0]
    const contact = finish(name, phone, pick(cells, emailColumns).split(/\s*:::\s*/)[0])
    if (contact) found.push(contact)
  }
  return found
}

/** Reads a contacts file by what it is: .vcf, or .csv (also text pasted into a file with another ending, judged by its content). */
export function parseContactFile(fileName: string, text: string): ImportedContact[] {
  const isVcf = /\.vcf$/i.test(fileName) || /^\s*BEGIN:VCARD/i.test(text)
  return (isVcf ? parseVcf(text) : parseCsv(text)).slice(0, MAX_IMPORT)
}

/** Whether two entries are the same person: the same name, the same number (however written) or the same email. */
export function isSameContact(a: ImportedContact, b: ImportedContact): boolean {
  if (plain(a.name) !== '' && plain(a.name) === plain(b.name)) return true
  if (phoneTail(a.phone) !== '' && phoneTail(a.phone) === phoneTail(b.phone)) return true
  return a.email !== '' && a.email.toLowerCase() === b.email.toLowerCase()
}

export interface ImportCandidate extends ImportedContact {
  /** Already saved in Volita, or repeated earlier in the same file. */
  duplicate: boolean
}

/** Marks each contact in the file that is already saved (or appears twice in the file), so the list can leave those unticked. */
export function markDuplicates(existing: readonly ImportedContact[], incoming: readonly ImportedContact[]): ImportCandidate[] {
  const seen: ImportedContact[] = [...existing]
  return incoming.map((contact) => {
    const duplicate = seen.some((other) => isSameContact(contact, other))
    seen.push(contact)
    return { ...contact, duplicate }
  })
}
