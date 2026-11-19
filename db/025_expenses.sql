CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  spent_on     date NOT NULL,
  supplier     text NOT NULL,
  note         text NOT NULL DEFAULT '',
  total_cents  bigint NOT NULL CHECK (total_cents > 0),
  vat_cents    bigint NOT NULL DEFAULT 0 CHECK (vat_cents >= 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_user_idx ON expenses (user_id, spent_on DESC)
