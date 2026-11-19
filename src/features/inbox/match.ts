import type { InboxChatInfo } from '../../lib/native-inbox'

import { normalise } from '../../lib/chat-intent'

export { asksAboutPerson, guessName, normalise, wantsCatchUp } from '../../lib/chat-intent'

/** The number of single-letter changes (add, remove, swap one) to turn one word into the other. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = row
  }
  return previous[b.length]
}

/**
 * True when two words are the same, or close enough that speech recognition may have spelled a name differently. Short words
 * must match exactly (or "Sam" would match "Pam"); longer names may be one letter off, and long ones two.
 */
function closeEnough(a: string, b: string): boolean {
  if (a === b) return true
  const shortest = Math.min(a.length, b.length)
  if (shortest < 5) return false
  return editDistance(a, b) <= (shortest >= 7 ? 2 : 1)
}

/** The words in a chat's name worth matching: letters only, at least three of them. */
function nameWords(chat: string): string[] {
  return normalise(chat)
    .split(' ')
    .filter((word) => word.length >= 3)
}

/** The chats whose name (or any word of it) the person said, newest first. "Catch me up with Abigail" finds "Abigail Smith". */
export function chatsNamedIn(utterance: string, chats: InboxChatInfo[]): InboxChatInfo[] {
  const spoken = normalise(utterance).split(' ')
  return chats
    .filter((info) => nameWords(info.chat).some((word) => spoken.some((said) => closeEnough(word, said))))
    .sort((a, b) => b.lastTime - a.lastTime)
}
