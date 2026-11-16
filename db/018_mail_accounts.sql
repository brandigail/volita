-- Email accounts other than Gmail (Gmail keeps its own table, gmail_connections). One connected mailbox per person.
-- The address and the secret (an app password, or the Microsoft refresh token) are encrypted per person. The server
-- names and ports are not secret.
CREATE TABLE IF NOT EXISTS mail_accounts (
  user_id         text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('outlook', 'yahoo', 'aol', 'icloud', 'zoho', 'other')),
  email           text NOT NULL,
  secret          text NOT NULL,
  settings        jsonb NOT NULL DEFAULT '{}',
  needs_reconnect boolean NOT NULL DEFAULT false,
  connected_at    timestamptz NOT NULL DEFAULT now()
);

-- Outlook message ids are very long, so the assistant is given a short handle instead and it is looked up here.
CREATE TABLE IF NOT EXISTS mail_handles (
  user_id    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  handle     text NOT NULL,
  ref        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, handle)
)
