-- One access token per person for the iPhone "Catch me up" Shortcut, which cannot use the sign-in cookie.
-- Only a hash is stored, so a copy of the database cannot be used to read anyone's chats. The token works for one thing: catching up on a chat screenshot.
CREATE TABLE IF NOT EXISTS shortcut_tokens (
  user_id      text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
)
