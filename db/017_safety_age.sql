-- Date of birth (Volita is for adults 18 and over), and accounts the owner has closed.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "birthDate" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspendedAt" timestamptz;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "suspendedReason" text;

-- What the safety checks stopped. Only the kind and where it happened: the blocked text itself is never stored.
CREATE TABLE IF NOT EXISTS safety_events (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('card', 'bank', 'password', 'limit', 'spam')),
  source      text NOT NULL DEFAULT '',
  owner_told  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safety_events_user_idx ON safety_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_events_recent_idx ON safety_events (created_at DESC)
