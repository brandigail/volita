CREATE TABLE IF NOT EXISTS pro_access (
  user_id          text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  pro_until        timestamptz,
  trial_started_at timestamptz,
  referred         boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS referral_codes (
  user_id     text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  code        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  referred_id text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  referrer_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id)
