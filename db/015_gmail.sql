CREATE TABLE IF NOT EXISTS gmail_connections (
  user_id         text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  google_email    text NOT NULL,
  refresh_token   text NOT NULL,
  needs_reconnect boolean NOT NULL DEFAULT false,
  connected_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gmail_pending (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  to_addr     text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  thread_id   text,
  reply_to_id text,
  differs     boolean NOT NULL DEFAULT false,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS gmail_pending_user_idx ON gmail_pending (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gmail_log (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN ('connect', 'disconnect', 'search', 'read', 'prepare', 'send', 'cancel')),
  detail      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gmail_log_user_idx ON gmail_log (user_id, created_at DESC)
