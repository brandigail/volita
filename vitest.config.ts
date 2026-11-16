import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Tests only cover server-side logic, so they run in plain Node and skip the app's Vite plugins. The database
// address comes from .env.local when it exists; the integration tests skip themselves when it does not.
export default defineConfig(({ mode }) => {
  const local = loadEnv(mode, process.cwd(), '')
  return {
    test: {
      environment: 'node',
      include: ['netlify/tests/**/*.test.ts', 'src/**/*.test.ts'],
      testTimeout: 30_000,
      env: {
        DATABASE_URL: local.DATABASE_URL ?? '',
        DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        BETTER_AUTH_SECRET: 'test-secret-not-used-in-production',
        GOOGLE_CLIENT_ID: 'test-client-id',
        GOOGLE_CLIENT_SECRET: 'test-client-secret',
        OWNER_EMAILS: '',
      },
    },
  }
})
