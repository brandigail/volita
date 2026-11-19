import { registerPlugin } from '@capacitor/core'
import type { ImportedContact } from './contact-import.ts'
import { isAndroidApp } from './native-listening'

interface VolitaContactsPlugin {
  read: () => Promise<{ contacts: ImportedContact[] }>
}

/** Implemented in android/ (VolitaContactsPlugin). It only exists inside the Android app, never in a browser. */
const Native = registerPlugin<VolitaContactsPlugin>('VolitaContacts')

/** The person said no to the "allow contacts" question. */
export class ContactsDeniedError extends Error {
  constructor() {
    super('Volita was not allowed to read your contacts.')
  }
}

export const canReadPhoneContacts = isAndroidApp

/** Asks Android for permission (once) and reads the address book. Only the name, number and email of each person come back. */
export async function readPhoneContacts(): Promise<ImportedContact[]> {
  try {
    return (await Native.read()).contacts
  } catch (err) {
    if (err instanceof Error && err.message === 'denied') throw new ContactsDeniedError()
    throw err
  }
}
