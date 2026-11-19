// Shared by the client and the Netlify Functions. Keep this file free of DOM and Node APIs.

/** The part of the day, from the hour on the person's own clock. */
export function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/** What to call the person: their nickname if they gave one, otherwise the first word of their name. */
export function callName(profile: { nickname: string; name: string }): string {
  return profile.nickname.trim() || profile.name.trim().split(/\s+/)[0] || ''
}

/** "Good morning, Mayoman." The date is a parameter so the result is the same wherever it runs. */
export function greetingFor(profile: { nickname: string; name: string }, now: Date): string {
  const name = callName(profile)
  const greeting = `Good ${partOfDay(now.getHours())}`
  return name ? `${greeting}, ${name}.` : `${greeting}.`
}

/** The line spoken on the first conversation of the day. Short enough for one spoken request. */
export function spokenWelcome(profile: { nickname: string; name: string }): string {
  const name = callName(profile)
  return name ? `Welcome back, ${name}. What can I do for you?` : 'Welcome back. What can I do for you?'
}
