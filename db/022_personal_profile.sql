-- What Volita calls the person (for example "Mayoman") and one line on what their business does. Both optional.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "nickname" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "businessAbout" text
