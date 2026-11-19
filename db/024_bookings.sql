CREATE TABLE IF NOT EXISTS booking_pages (
  user_id            text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  enabled            boolean NOT NULL DEFAULT false,
  title              text NOT NULL DEFAULT '',
  intro              text NOT NULL DEFAULT '',
  slot_minutes       integer NOT NULL DEFAULT 60 CHECK (slot_minutes BETWEEN 15 AND 240),
  days_ahead         integer NOT NULL DEFAULT 14 CHECK (days_ahead BETWEEN 1 AND 60),
  min_notice_hours   integer NOT NULL DEFAULT 12 CHECK (min_notice_hours BETWEEN 0 AND 168),
  hours              text NOT NULL DEFAULT '{}',
  time_zone          text NOT NULL DEFAULT 'Africa/Johannesburg',
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  customer_name    text NOT NULL,
  customer_phone   text NOT NULL DEFAULT '',
  customer_email   text NOT NULL DEFAULT '',
  note             text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  agenda_item_id   uuid REFERENCES agenda_items (id) ON DELETE SET NULL,
  reminded_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_idx ON bookings (user_id, starts_at) WHERE status = 'CONFIRMED';
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, starts_at)
