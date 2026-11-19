// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

/** The part of the day, from the hour on the person's own clock. */
export function partOfDay(hour: number): PartOfDay {
  if (hour >= 22 || hour < 4) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/** What to call the person: their nickname if they gave one, otherwise the first word of their name. */
export function callName(profile: { nickname: string; name: string }): string {
  return profile.nickname.trim() || profile.name.trim().split(/\s+/)[0] || ''
}

/** `{name}` is where the person's name goes; a greeting still reads well without it (see {@link fill}). */
const ANYTIME = [
  'Hello there, {name}.',
  'Welcome back, {name}.',
  'Back at it again, {name}?',
  'Good to see you, {name}.',
  'Hey {name}, what are we sorting today?',
  'Ready when you are, {name}.',
  "Hi {name}, let's get it done.",
  'Look who is back. Hello, {name}.',
  'What are we working on, {name}?',
]

const BY_PART: Record<PartOfDay, string[]> = {
  morning: ['Good morning, {name}.', 'Morning, {name}. Let\'s make it a good one.', 'Rise and shine, {name}.', 'Fresh start, {name}. What first?'],
  afternoon: ['Good afternoon, {name}.', 'Afternoon, {name}. How is the day going?', 'Hope the day is treating you well, {name}.'],
  evening: ['Good evening, {name}.', 'Evening, {name}. Still going strong?', 'Winding down or pushing on, {name}?'],
  night: ['Burning the midnight oil, {name}?', 'Late one, {name}?', 'Still up, {name}? Let\'s be quick about it.'],
}

/** Day of the week, 0 = Sunday. */
const BY_DAY: Record<number, string[]> = {
  0: ['Working on a Sunday, {name}? Respect.'],
  1: ['Fresh week, {name}. Let\'s go.', 'Monday again, {name}. We will take it one job at a time.'],
  5: ['Happy Friday, {name}.', 'Nearly the weekend, {name}. Let\'s finish strong.'],
  6: ['Saturday hustle, {name}? Respect.'],
}

/** Puts the name in; with no name, "Hey {name}, what" becomes "Hey, what" and "Welcome back, {name}." becomes "Welcome back.". */
function fill(template: string, name: string): string {
  return name ? template.replaceAll('{name}', name) : template.replace(/,? \{name\}/g, '')
}

/** Every greeting that could be shown at this time, so the choice can avoid the one shown last. */
export function greetingChoices(name: string, now: Date): string[] {
  const templates = [...ANYTIME, ...BY_PART[partOfDay(now.getHours())], ...(BY_DAY[now.getDay()] ?? [])]
  return templates.map((template) => fill(template, name))
}

/**
 * A hello for the person, different from the last one shown. `previous` is that last one (or empty) and `random` is
 * a number from 0 up to but not including 1; both are parameters so the choice can be tested.
 */
export function pickGreeting(profile: { nickname: string; name: string }, now: Date, previous = '', random: () => number = Math.random): string {
  const choices = greetingChoices(callName(profile), now)
  const fresh = choices.filter((choice) => choice !== previous)
  const pool = fresh.length > 0 ? fresh : choices
  return pool[Math.floor(random() * pool.length)]
}

/** The question that follows a spoken welcome. */
export const WELCOME_QUESTION = 'What can I do for you?'

/** The line spoken on the first conversation of the day: the greeting shown on screen, then a question. Short enough for one spoken request. */
export function spokenWelcome(greeting: string): string {
  return `${greeting} ${WELCOME_QUESTION}`
}
