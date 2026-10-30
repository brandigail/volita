CREATE TABLE IF NOT EXISTS plan_invites (
  email       text PRIMARY KEY,
  plan        text NOT NULL CHECK (plan IN ('basic', 'pro')),
  note        text NOT NULL DEFAULT '',
  created_by  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
)
