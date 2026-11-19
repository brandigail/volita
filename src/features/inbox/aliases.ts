import { normalise } from './match'

const KEY = 'volita:chat-aliases'

/** The names the person calls each WhatsApp chat, keyed by the chat's own name: "Squishmellow 💞" is also "Abigail" and "my wife". */
export type ChatAliases = Record<string, string[]>

export function readAliases(): ChatAliases {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (typeof parsed !== 'object' || parsed === null) return {}
    const clean: ChatAliases = {}
    for (const [chat, names] of Object.entries(parsed)) {
      if (Array.isArray(names)) clean[chat] = names.filter((name): name is string => typeof name === 'string' && name.trim() !== '')
    }
    return clean
  } catch {
    return {}
  }
}

function writeAliases(aliases: ChatAliases): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(aliases))
  } catch {
    // Storage can be blocked; the names then last only until the page is closed.
  }
}

/** Splits "Abigail, my wife" into the names to save. */
export function parseNames(input: string): string[] {
  return [...new Set(input.split(',').map((name) => name.trim()).filter(Boolean))].slice(0, 6)
}

/** Replaces the names for one chat; an empty list removes them. Returns what is stored. */
export function setAliases(chat: string, names: string[]): ChatAliases {
  const aliases = readAliases()
  if (names.length === 0) delete aliases[chat]
  else aliases[chat] = names
  writeAliases(aliases)
  return aliases
}

/** Adds one name to a chat's names (used when the person tells Volita which chat someone is). */
export function addAlias(chat: string, name: string): ChatAliases {
  const aliases = readAliases()
  const names = aliases[chat] ?? []
  return setAliases(chat, names.some((existing) => normalise(existing) === normalise(name)) ? names : [...names, name].slice(-6))
}

/** What to call a chat when speaking about it: the first name the person gave it, otherwise the chat's own name. */
export function aliasLabel(chat: string, aliases: ChatAliases = readAliases()): string {
  return aliases[chat]?.[0] ?? chat
}

/** The chat a spoken name stands for: the chat the person gave that name to, otherwise the name itself (it may already be the chat's own name). */
export function chatTitleFor(name: string, aliases: ChatAliases = readAliases()): string {
  const wanted = normalise(name)
  for (const [chat, names] of Object.entries(aliases)) {
    if (names.some((alias) => normalise(alias) === wanted)) return chat
  }
  return name
}

/** The chat names that any of the person's own names for chats appear in what they said, e.g. "Abigail" gives "Squishmellow 💞". */
export function chatsAliasedIn(utterance: string, aliases: ChatAliases): string[] {
  const spoken = ` ${normalise(utterance)} `
  const titles: string[] = []
  for (const [chat, names] of Object.entries(aliases)) {
    if (names.some((name) => normalise(name) !== '' && spoken.includes(` ${normalise(name)} `))) titles.push(chat)
  }
  return titles
}
