import { Pool } from '@neondatabase/serverless'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { ACCOUNT_CLOSED_MESSAGE, BIRTH_DATE_NEEDED, UNDER_AGE_MESSAGE, isAdult } from '../../../src/lib/age.ts'
import { isSuspended, suspendUser } from './account-status.ts'
import { sealCalendarLink } from './calendar-secret.ts'

/** Netlify sets `URL` to the deployed site; BETTER_AUTH_URL overrides it (and is needed for local dev). */
const baseURL = process.env.BETTER_AUTH_URL ?? process.env.URL

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Sign-up is closed unless ALLOW_SIGNUP=true, so strangers cannot make accounts and use the AI quota.
    disableSignUp: process.env.ALLOW_SIGNUP !== 'true',
  },
  // Serverless instances don't share memory, so rate-limit counters live in the database (db/004_usage_limits.sql).
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 8 },
      '/sign-up/email': { window: 3600, max: 10 },
    },
  },
  advanced: {
    // Netlify puts the real client address in x-nf-client-connection-ip.
    ipAddress: { ipAddressHeaders: ['x-nf-client-connection-ip', 'x-forwarded-for'] },
  },
  // Profile fields live on the user row (see db/003_user_profile.sql) and are editable via updateUser.
  // The calendar link works like a password to the whole calendar, so it is encrypted before it is saved (see crypto.ts).
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Volita is for adults: no account without a date of birth showing 18 or over.
          if (!isAdult(user.birthDate)) throw new APIError('BAD_REQUEST', { message: user.birthDate ? UNDER_AGE_MESSAGE : BIRTH_DATE_NEEDED })
          return { data: sealCalendarLink(user) }
        },
      },
      update: {
        before: async (user, ctx) => {
          if ('birthDate' in user && !isAdult(user.birthDate)) {
            // An existing account giving a date under 18 is closed, so it cannot simply try another date.
            const userId = ctx?.context.session?.user.id
            if (userId && user.birthDate) await suspendUser(userId, 'Under 18')
            throw new APIError('BAD_REQUEST', { message: user.birthDate ? UNDER_AGE_MESSAGE : BIRTH_DATE_NEEDED })
          }
          return { data: sealCalendarLink(user) }
        },
      },
    },
    session: {
      // A closed account cannot sign in again. 423 (locked) rather than 403, which Netlify's local server mistakes for a
      // missing page.
      create: {
        before: async (session) => {
          if (await isSuspended(session.userId)) throw new APIError('LOCKED', { message: ACCOUNT_CLOSED_MESSAGE })
        },
      },
    },
  },
  user: {
    deleteUser: { enabled: true },
    additionalFields: {
      businessName: { type: 'string', required: false },
      role: { type: 'string', required: false },
      phone: { type: 'string', required: false },
      signature: { type: 'string', required: false },
      calendarUrl: { type: 'string', required: false },
      /** YYYY-MM-DD, given at sign-up (or once, by accounts made before the age check). */
      birthDate: { type: 'string', required: false },
      /** Set by the owner (or by an under-18 date of birth). The person cannot change it. */
      suspendedAt: { type: 'date', required: false, input: false },
    },
  },
})
