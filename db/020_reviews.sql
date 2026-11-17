-- One review per person, shown on the landing page. The person can change or delete theirs.
CREATE TABLE IF NOT EXISTS reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL UNIQUE REFERENCES "user" ("id") ON DELETE CASCADE,
  rating     int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_recent_idx ON reviews (created_at DESC)
