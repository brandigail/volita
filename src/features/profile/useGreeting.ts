import { authClient } from '../../lib/auth-client'
import { profileFromUser } from '../../lib/profile'
import { visitGreeting } from '../../lib/visit-greeting'
import type { Profile } from '../../types/profile'

/** The signed-in person's profile and this visit's hello ("Back at it again, Mayoman?"), or nulls before they are signed in. */
export function useGreeting(): { profile: Profile | null; line: string | null } {
  const { data: session } = authClient.useSession()
  if (!session) return { profile: null, line: null }
  const profile = profileFromUser(session.user)
  return { profile, line: visitGreeting(profile) }
}
