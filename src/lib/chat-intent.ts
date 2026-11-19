// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** Lower case, no accents, letters and spaces only, so "Abigaïl!" and "abigail" compare equal. */
export function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const GENERIC_CATCH_UP =
  /\b(catch me up|catch up|what did i miss|what have i missed|who (messaged|texted|wrote|has messaged)|any (new )?messages|anything new|new messages|my messages|unread)\b/

/** True when the person asks about their messages in general, not about one named person. */
export function wantsCatchUp(utterance: string): boolean {
  return GENERIC_CATCH_UP.test(normalise(utterance))
}

const ASKS_ABOUT_PERSON =
  /\b(catch me up (with|on)|messages? from|anything from|what (did|has|is)\s+\w+\s+(say\w*|said|send\w*|sent|writ\w*|wrote|messag\w*|text\w*)|(did|has)\s+\w+\s+(say\w*|said|send\w*|sent|writ\w*|wrote|messag\w*|text\w*)|tell me what \w+ (said|wrote|sent)|read me \w+ messages?)\b/

/** True when the person asks about one particular person's messages, not their messages in general. */
export function asksAboutPerson(utterance: string): boolean {
  const spoken = normalise(utterance)
  return ASKS_ABOUT_PERSON.test(spoken) && !/\b(catch me up|catch up)\s*$/.test(spoken)
}

const NOT_NAMES = new Set(['the', 'my', 'any', 'all', 'you', 'him', 'her', 'them', 'me', 'i', 'he', 'she', 'they', 'it', 'today', 'this', 'that', 'what', 'who', 'new', 'some'])

const NAME_AFTER = /(?:catch me up (?:with|on)|messages? from|anything from|what did|what has|what is|did|has|tell me what|read me)\s+([\p{L}']+)/iu

/** The name the person said ("Abigail" in "catch me up with Abigail"), or null if no name stands out. */
export function guessName(utterance: string): string | null {
  const found = NAME_AFTER.exec(utterance)?.[1]
  if (!found || NOT_NAMES.has(found.toLowerCase())) return null
  return found.replace(/'s$/i, '')
}
