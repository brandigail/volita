CREATE TABLE IF NOT EXISTS plan_grants (
  user_id     text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  plan        text NOT NULL CHECK (plan IN ('basic', 'pro')),
  note        text NOT NULL DEFAULT '',
  granted_by  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_flags (
  user_id           text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  onboarded_at      timestamptz,
  style_learned_at  timestamptz
);
CREATE TABLE IF NOT EXISTS voice_turns (
  user_id     text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  turn_id     uuid NOT NULL,
  month       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, turn_id)
);
CREATE INDEX IF NOT EXISTS voice_turns_month_idx ON voice_turns (user_id, month);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'said';
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS original_body text;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS followup_done_at timestamptz;
CREATE TABLE IF NOT EXISTS templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  title       text NOT NULL,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS templates_user_idx ON templates (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name        text NOT NULL,
  price       text NOT NULL,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS services_user_idx ON services (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS one_off_steps (name text PRIMARY KEY);
INSERT INTO plan_grants (user_id, plan, note, granted_by) SELECT "id", 'pro', 'Existing account when plans were introduced', 'migration' FROM "user" WHERE NOT EXISTS (SELECT 1 FROM one_off_steps WHERE name = 'grant-existing-pro') ON CONFLICT DO NOTHING;
INSERT INTO user_flags (user_id, onboarded_at) SELECT "id", now() FROM "user" WHERE NOT EXISTS (SELECT 1 FROM one_off_steps WHERE name = 'grant-existing-pro') ON CONFLICT DO NOTHING;
INSERT INTO one_off_steps (name) VALUES ('grant-existing-pro') ON CONFLICT DO NOTHING
