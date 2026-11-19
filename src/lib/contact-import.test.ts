import { describe, expect, it } from 'vitest'
import { cleanContacts, isSameContact, markDuplicates, normalizeNumber, parseContactFile, parseCsv, parseVcf } from './contact-import'

describe('normalizeNumber', () => {
  it('gives local South African numbers the country code and drops spaces and tel:', () => {
    expect(normalizeNumber('082 123 4567')).toBe('+27821234567')
    expect(normalizeNumber('tel:+27 (82) 123-4567')).toBe('+27821234567')
    expect(normalizeNumber('0027821234567')).toBe('+27821234567')
  })

  it('refuses a number that is too short', () => {
    expect(normalizeNumber('12345')).toBe('')
  })
})

describe('parseVcf', () => {
  const card = (lines: string) => `BEGIN:VCARD\r\nVERSION:3.0\r\n${lines}\r\nEND:VCARD\r\n`

  it('reads a name, the mobile number first, and an email', () => {
    const text = card('FN:Mrs Naidoo\r\nTEL;TYPE=HOME:011 555 0000\r\nTEL;TYPE=CELL:082 123 4567\r\nEMAIL;TYPE=INTERNET:Naidoo@Example.com')
    expect(parseVcf(text)).toEqual([{ name: 'Mrs Naidoo', phone: '+27821234567', email: 'naidoo@example.com' }])
  })

  it('builds the name from N when there is no FN, and unfolds long lines', () => {
    const text = card('N:Botha;Pieter;;Mr;\r\nTEL;CELL:+27 83 999\r\n 0000')
    expect(parseVcf(text)).toEqual([{ name: 'Mr Pieter Botha', phone: '+27839990000', email: '' }])
  })

  it('reads several cards from one file and skips ones with no way to reach them or only a number as a name', () => {
    const text = card('FN:Sipho\r\nTEL:0821111111') + card('FN:No Details') + card('FN:0821234567\r\nTEL:0821234567')
    expect(parseVcf(text).map((contact) => contact.name)).toEqual(['Sipho'])
  })

  it('handles Apple-style item prefixes and escaped commas', () => {
    expect(parseVcf(card('FN:Dube\\, Sam\r\nitem1.TEL;type=pref:0821112222'))).toEqual([{ name: 'Dube, Sam', phone: '+27821112222', email: '' }])
  })
})

describe('parseCsv', () => {
  it('reads a Google Contacts export', () => {
    const csv = 'First Name,Middle Name,Last Name,Phone 1 - Label,Phone 1 - Value,E-mail 1 - Value\nSipho,,Dlamini,Mobile,082 555 0101,sipho@example.com\n'
    expect(parseCsv(csv)).toEqual([{ name: 'Sipho Dlamini', phone: '+27825550101', email: 'sipho@example.com' }])
  })

  it('reads an Outlook export with quoted fields and a number in either column', () => {
    const csv = '"First Name","Last Name","E-mail Address","Mobile Phone","Primary Phone"\n"Lerato","Mokoena, Jr","","","011 000 1111"\n'
    expect(parseCsv(csv)).toEqual([{ name: 'Lerato Mokoena, Jr', phone: '+27110001111', email: '' }])
  })

  it('reads a plain Name, Phone, Email file and ignores a byte-order mark and empty lines', () => {
    expect(parseCsv('\uFEFFName,Phone,Email\n\nMrs Naidoo,0821234567,n@example.com\n')).toEqual([{ name: 'Mrs Naidoo', phone: '+27821234567', email: 'n@example.com' }])
  })

  it('takes the first of several numbers in one cell', () => {
    expect(parseCsv('Name,Phone 1 - Value\nSam,0821111111 ::: 0832222222\n')[0].phone).toBe('+27821111111')
  })

  it('returns nothing for an empty or heading-only file', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('Name,Phone\n')).toEqual([])
  })
})

describe('parseContactFile', () => {
  it('chooses the reader from the file ending, or from what is inside', () => {
    expect(parseContactFile('contacts.vcf', 'BEGIN:VCARD\nFN:A B\nTEL:0821111111\nEND:VCARD')).toHaveLength(1)
    expect(parseContactFile('export.txt', 'BEGIN:VCARD\nFN:A B\nTEL:0821111111\nEND:VCARD')).toHaveLength(1)
    expect(parseContactFile('export.csv', 'Name,Phone\nA B,0821111111')).toHaveLength(1)
  })
})

describe('duplicates', () => {
  const saved = [{ name: 'Mrs Naidoo', phone: '+27 82 123 4567', email: '' }]

  it('spots the same person by name, number written another way, or email', () => {
    expect(isSameContact({ name: 'mrs naidoo', phone: '', email: '' }, saved[0])).toBe(true)
    expect(isSameContact({ name: 'Someone', phone: '082-123-4567', email: '' }, saved[0])).toBe(true)
    expect(isSameContact({ name: 'A', phone: '', email: 'X@y.com' }, { name: 'B', phone: '', email: 'x@y.com' })).toBe(true)
    expect(isSameContact({ name: 'Other', phone: '083 999 0000', email: '' }, saved[0])).toBe(false)
  })

  it('marks what is already saved and what repeats inside the file, keeping the first', () => {
    const incoming = [
      { name: 'Mrs Naidoo', phone: '0821234567', email: '' },
      { name: 'Sipho', phone: '0821110000', email: '' },
      { name: 'Sipho D', phone: '082 111 0000', email: '' },
    ]
    expect(markDuplicates(saved, incoming).map((contact) => contact.duplicate)).toEqual([true, false, true])
  })
})

describe('cleanContacts', () => {
  it('tidies people read from the phone and drops entries with no name or no way to reach them', () => {
    const raw = [
      { name: '  Thandi   Mokoena ', phone: '082 123 4567', email: 'THANDI@Example.com' },
      { name: '', phone: '082 999 0000', email: '' },
      { name: 'No details', phone: '', email: '' },
      { name: '0821234567', phone: '0821234567', email: '' },
    ]
    expect(cleanContacts(raw)).toEqual([{ name: 'Thandi Mokoena', phone: '+27821234567', email: 'thandi@example.com' }])
  })
})
