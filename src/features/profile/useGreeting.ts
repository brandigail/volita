import { authClient } from '../../lib/auth-client'
import { callName, greetingFor } from '../../lib/greeting'
import { profileFromUser } from '../../lib/profile'
import type { Profile } from '../../types/profile'

/** The signed-in person's profile and a time-of-day greeting for them ("Good morning, Mayoman."), or null if there is no name yet. */
export function useGreeting(): { profile: Profile | null; line: string | null } {
  const { data: session } = authClient.useSession()
  if (!session) return { profile: null, line: null }
  const profile = profileFromUser(session.user)
  return { profile, line: callName(profile) ? greetingFor(profile, new Date()) : null }
}
