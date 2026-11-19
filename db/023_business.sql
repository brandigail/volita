CREATE TABLE IF NOT EXISTS business_settings (
  user_id              text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  vat_registered       boolean NOT NULL DEFAULT false,
  vat_number           text NOT NULL DEFAULT '',
  bank_details         text NOT NULL DEFAULT '',
  payment_terms_days   integer NOT NULL DEFAULT 7 CHECK (payment_terms_days BETWEEN 0 AND 90),
  invoice_note         text NOT NULL DEFAULT '',
  review_link          text NOT NULL DEFAULT '',
  next_invoice_number  integer NOT NULL DEFAULT 1,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  number            text NOT NULL,
  contact_id        uuid REFERENCES contacts (id) ON DELETE SET NULL,
  customer_name     text NOT NULL,
  customer_phone    text NOT NULL DEFAULT '',
  customer_email    text NOT NULL DEFAULT '',
  items             text NOT NULL,
  vat_rate          integer NOT NULL DEFAULT 0 CHECK (vat_rate BETWEEN 0 AND 30),
  subtotal_cents    bigint NOT NULL CHECK (subtotal_cents >= 0),
  vat_cents         bigint NOT NULL CHECK (vat_cents >= 0),
  total_cents       bigint NOT NULL CHECK (total_cents >= 0),
  status            text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'PAID', 'CANCELLED')),
  issued_on         date NOT NULL DEFAULT current_date,
  due_on            date NOT NULL,
  paid_at           timestamptz,
  reminders_sent    integer NOT NULL DEFAULT 0,
  last_reminded_at  timestamptz,
  note              text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);
CREATE INDEX IF NOT EXISTS invoices_user_idx ON invoices (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_open_idx ON invoices (user_id, status, due_on)
