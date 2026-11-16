-- Which version of the terms of use each person accepted (after going through every part), and when.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "termsVersion" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" timestamptz
