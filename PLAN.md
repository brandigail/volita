# Volita: Build Plan

- [x] 1. Scaffold Vite React TS, Tailwind v4 plugin, lucide-react, zod, `.env.example`, `.gitignore`, `netlify.toml`
- [x] 2. Provider setup in `main.tsx`; layout, theme, mobile-first shell
- [x] 3. Neon schema (`drafts` table) and a migration script
- [x] 4. `types/` (Draft, DraftCategory) and a shared zod schema
- [x] 5. `useAudioRecorder` hook: permission, start/stop, timer, mime detection, 60s cap
- [x] 6. `netlify/functions/transcribe.ts` (Groq Whisper) with passcode check and size limits
- [x] 7. `netlify/functions/generate.ts` (Groq LLM, JSON mode, zod validation, one retry on invalid JSON)
- [x] 8. Record screen UI: record button, timer, processing states, error handling
- [x] 9. Editable draft card with copy, mailto and sms actions (plus Gmail, Outlook and Yahoo compose links)
- [x] 10. Accounts: Better Auth (email + password) on Neon; sign up, sign in, sign out UI; functions check the session cookie instead of the shared passcode
- [x] 11. Profile and sign-off: display name, business name, role, phone, signature; settings screen; `generate` writes drafts in the user's name and sign-off
- [x] 12. Per-user rate limiting and daily quota on `transcribe` and `generate` (sign-up is open, so protect the Groq quota)
- [x] 13. `netlify/functions/db-sync.ts` (list, upsert, delete, scoped to the signed-in user) and a client sync layer
- [x] 14. Draft history screen with search and category filter
- [x] 15. PWA: manifest, icons in `/public`, `vite-plugin-pwa` prompt-for-update banner, offline shell
- [ ] 16. Test the full flow on desktop Chrome and a real phone (iOS Safari and Android Chrome)
- [ ] 17. Build, lint and `tsc --noEmit` clean; no console errors
- [x] 18. README (pitch, architecture diagram, features, recruiter demo bullets)
- [~] 19. Deploy to Netlify with env vars; test live; push to GitHub; update root `LINKS.md`

## Voice assistant (added 2026-10-26)
- [x] A1. Channel picker before recording (email, quote, WhatsApp, SMS, Instagram, Facebook, TikTok, note) and a redesign
- [x] A2. `assistant` function with tool calling: agenda, drafts, sent state, create draft; own model and token budget
- [x] A3. `speak` function (Groq Orpheus voice) with browser-voice fallback; hands-free listener with silence detection
- [x] A4. Agenda tab (Volita items plus linked iCal calendar) and "Mark as sent"
- [x] A5. Groq accepts the Orpheus terms (console), then tune the voice and reply speed on the live site
- [x] A6. Android app (Capacitor shell, foreground microphone service, signed release APK); iPhone stays on the web app

## Round 3 (2026-10-26)
- [x] B1. Diana as the default voice; business name optional
- [x] B2. "Send at" reminders, To send / Sent filter, planned sends on the agenda, assistant tool schedule_send
- [x] B3. Assistant conversation history (Conversations tab)
- [x] B4. Calendar pop-up for Google / Outlook / Apple with paste and test
- [x] B5. Recordings up to 5 minutes; spoken and written language settings (Afrikaans, Spanish, others, translation)
- [x] B6. Subscriptions preview (owner account only) with live exchange rates
- [x] B7a. PayFast sandbox: signed checkout, payment notifications (ITN), subscription status, cancel, confirmation email (needs RESEND_API_KEY)
- [ ] B7b. Own PayFast sandbox merchant (signing and cancel through PayFast), then live merchant, privacy / terms / refund pages, per-plan limits
- [ ] B8. One-tap calendar sign-in with Google or Microsoft (needs OAuth credentials)

## Personal assistant memory (added 2026-10-28)
- [x] C1. `memories` and `contacts` tables (encrypted text, per user), store, REST functions and a "What Volita knows about you" section on the Profile tab
- [x] C2. Assistant tools `remember`, `save_contact`, `recall`, `forget`; relevant memory is added to the assistant prompt on every turn
- [x] C3. Drafts use preferences and saved people (recipient email or phone filled in from a saved contact)
- [ ] C4. Check on a real phone and with dad's real wording; tune the prompts
- [x] C5. Learn writing style from edited, sent drafts
- [x] C6. Morning briefing on the Assistant tab (today's meetings, overdue sends, unanswered drafts)
- [ ] C7. Inbox awareness (blocked on the SECURITY.md gaps and two-step login)

## Pricing and plans (demo stage: built 2026-10-30 without billing or deploy; details in PRICING-PLAN.md sections 8 and 9)
- [~] D0. Prerequisites (security build still to deploy; PayFast and paid Groq deliberately postponed): deploy the pending security build after the Netlify reset (2026-11-10), start the PayFast merchant application, decide on paid Groq
- [x] D1. `free | basic | pro` in `plans.ts`, shared `limits.ts`, `getPlan()` with `OWNER_EMAILS` override, migration 013 (plan, monthly counters, memory source)
- [x] D2. Enforce server-side: recording seconds, channels, languages, assistant tools, memory and contact caps, history length, calendar count
- [x] D3. Meter drafts on `generate` and transcription by audio seconds; one assistant turn = one `assistant` call; premium voice monthly pool with browser-voice fallback flag
- [x] D4. Free footer, locked-channel upgrade prompts, usage meter, plan comparison screen, three-question onboarding
- [x] D5. Pop-up notifications: Android local notifications, Settings toggles with test button, in-app reminders on web
- [ ] D6. (postponed by Brandon) Billing: B7b merchant, live mode, legal pages, upgrade / downgrade (lock, never delete) / cancel, annual plans
- [x] D7. Pro habit features: C6, tone regenerate, C5, templates, price list, quote to PDF, WhatsApp list
- [~] D8. Later (photo to caption, share into Volita and follow-up nudges are built; the rest waits): photo to caption, share into Volita (Android), follow-up nudges, web push, send from Volita, C7, payment links

- [x] E1. Gmail for Pro: Google sign-in (read + send only), encrypted tokens, search / read / prepare-reply tools with no send tool, approval card with Send and Cancel, spoken "send it", record of what was read and sent, disconnect with revoke, migration 015, tests (built 2026-11-16, not deployed)
- [ ] E2. Before deploying E1: create the Google Cloud project and OAuth client, add dad as a test user, set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Netlify, update the privacy policy (G8), test on a real phone

- [x] F1. Landing page, tour clip, 6 playable voices, try-it examples, privacy / terms / support pages, yearly toggle, SEO metadata (built 2026-11-16, not deployed)
- [x] F2. 14 day Pro trial (no card), referral Pro days, Basic 50 / Pro 300 drafts a day, locked Pro previews for Free and Basic (built 2026-11-16, migration 016 applied, not deployed)
- [ ] F3. Before deploying F1 and F2: Brandon reads the privacy and terms pages (plain-language drafts, not lawyer-reviewed), confirms the support email, keeps ALLOW_SIGNUP=true if the landing page will bring sign-ups, and checks the tour clip

- [x] G1. Adults only: date of birth at sign-up (under 18 refused), one-time check for older accounts (under 18 closes the account), terms and privacy updated (built 2026-11-16, migration 017 applied, not deployed)
- [x] G2. Safety: card numbers, bank details and passwords blocked before the AI or the database, pop-up warning with a count, owner alerted after 3 tries, for limit hammering and for more than 40 emails a day; Safety alerts and Close / Reopen account on the Family screen (built 2026-11-16, not deployed)
- [x] G3. Any email service: Outlook / Hotmail (Microsoft sign-in), Yahoo, AOL, iCloud, Zoho and business email (app password, IMAP and SMTP), one mailbox per person, migration 018 applied (built 2026-11-16, not deployed)
- [x] G5. Terms walkthrough: every part read and ticked one by one before sign-up (and once for existing accounts, and again whenever TERMS_VERSION changes); server refuses everything until the current version is accepted; migration 019 applied (built 2026-11-16, not deployed)
- [ ] G4. Before deploying G3's Outlook button: register the app in the Microsoft Entra admin centre and set MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (steps in .env.example); until then Outlook shows "Soon" and the rest work

## Round P: ready for dad and the first owners (planned 2026-11-19, do before Round H)
Netlify credits are tight, so everything is grouped into two deploys. Nothing deploys until Brandon says "deploy". Test every step on the local link first.

### Before deploy 1 (no credits used)
- [ ] P1. Back up `DATA_ENCRYPTION_KEY` from `.env.local` in a password manager (if lost, every encrypted draft is gone for good). Brandon does this one; the key is present in `.env.local`
- [~] P2. Clean build: `npm run build`, lint and `tsc --noEmit` pass, no console errors (item 17). Build, lint and type check pass (2026-11-19); the console-error check in a browser is still to do
- [x] P3. Run every test (`vitest`) and fix failures (17 files, 157 tests pass, 2026-11-19)
- [ ] P4. Local test on real phones (items 16 and C4): dad's iPhone in Safari and an Android phone, using dad's real wording for quotes and replies; tune prompts where drafts come out wrong
- [ ] P5. Read the privacy and terms pages (F3), confirm the support email in `src/config/site.ts`, decide `ALLOW_SIGNUP`
- [ ] P6. Google Cloud project and OAuth client for Gmail (E2): add dad as a test user, update the privacy policy (G8), test Gmail on the local link
- [ ] P7. Netlify settings ready: `DATA_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, SPA fallback redirect in `netlify.toml`

### Deploy 1: everything already built (D0, E1, F1, F2, G1, G2, G3, G5)
- [ ] P8. Deploy once, then run `scripts/encrypt-existing.ts` once, and check the database holds only scrambled text
- [ ] P9. Live smoke test on both phones: sign-up with terms walkthrough, record → draft, assistant, agenda, Gmail connect / read / send, share into Volita (Android), notifications
- [ ] P10. Give dad and each test owner their own account and Pro from the family screen

### Testing with owners (about 1-2 weeks, no deploys)
- [ ] P11. Dad plus 3-5 owners use it for real work; collect notes through the feedback box and a short chat after a week
- [ ] P12. Choose the Round H items from what they actually used and asked for

### Deploy 2: fixes from testing plus the first Round H items (expected H1, H2, H3)
- [ ] P13. Build and test locally, then deploy once with all fixes batched together

### Later, not needed for testing
- Payments live (B7b, D6): give testers Pro by hand until then
- Outlook button (G4), calendar one-tap sign-in (B8)
- Own domain, Google Play listing, POPIA information officer registration

## Round H: WhatsApp catch-up, money and bookings (planned 2026-11-18)
Order: H1 → H2 → H3 → H4 → H5 → H6 → H7 → H8 → H9 → H10, then H11 onwards when owners ask.

### WhatsApp without switching to Business (no Meta approval needed)
- [ ] H1. Catch me up from a screenshot: `features/share` accepts images; new `netlify/functions/read-chat.ts` reads chat screenshots with a vision model and returns messages grouped by sender; summary read aloud, then "what do you want to say?". iPhone: a "Catch me up" Shortcut (share sheet, Back Tap or Action Button) posts the screenshot. Plan limits: Free 3 a day, Basic and Pro more
- [ ] H2. Assistant tools `catch_up` (screenshots + email together) and `reply_to(contact)`; reply opens WhatsApp pre-filled (`wa.me`) or sends email; nothing sends without a spoken "send"
- [ ] H3. Driving mode: one big button, everything read aloud, no reading on screen, confirm every send by voice
- [ ] H10. WhatsApp Inbox (Android, Pro): `NotificationListenerService` beside `ListeningService.java`, exposed through `VolitaListeningPlugin`; keeps a copy of every WhatsApp message as it arrives (`com.whatsapp`, `com.whatsapp.w4b`) so read messages can be read again later; reply through the notification's reply action, fallback to pre-filled WhatsApp. Before release: check Google Play's notification-access policy and WhatsApp's terms, POPIA notice, auto-delete old messages, battery-optimisation exemption prompt

### Customers and money
- [ ] H4. Customer timeline: every quote, draft, captured message, job, payment and promise per customer, built on `contacts`; "what's the story with Mrs Naidoo?"
- [ ] H5. Quote → invoice → paid: invoice numbers, VAT on/off (15%) and VAT number, PDF, PayFast payment link, "mark paid" (paid automatically when the PayFast notification arrives)
- [ ] H6. Payment chasers: escalating reminders at 7, 14 and 30 days, approved by voice (reuse the unanswered-quote nudges)
- [ ] H7. Promise tracker: "I'll send it tomorrow" in a draft or captured message becomes a reminder
- [ ] H8. Booking link: public page where customers pick a slot that lands on the agenda; reminder the day before; optional PayFast deposit to cut no-shows; accepted quote can become a booking and an invoice in one tap
- [ ] H9. Review requests: when a job is marked done, draft a thank-you with the owner's Google review link

### Later (when owners ask)
- [ ] H11. "Power's out" command: "power's out at the shop until 4" drafts reschedule messages to everyone booked in that window. Add a load-shedding schedule feed only if load shedding returns (EskomSePush API is paid for commercial use, about $55+ a year; read its licence)
- [ ] H12. Price memory and margin check: warn when a quote differs from last time or is below material cost; update prices from a photo of a supplier price list or invoice
- [ ] H13. Weekly money summary by voice: quoted, won, invoiced, paid, outstanding
- [ ] H14. End-of-day wrap: jobs done, quotes sent, money owed, tomorrow's first job
- [ ] H15. Day plan by route: order today's jobs by location and send "on my way, about 20 minutes"
- [ ] H16. Receipt scanning (from QuickReceipt): log expenses, monthly and tax-year totals
- [ ] H17. Job sheet (from FieldOps): dictate work done plus photos, job report PDF sent with the invoice
- [ ] H18. Business card scanner: snap a card, save the contact, link it to the timeline
- [ ] H19. Unified inbox: WhatsApp captures, email and website chat per customer in one list
- [ ] H20. Website chat widget: embeddable script (Martinnaise first), messages land in the inbox, Volita reads and replies fully
- [ ] H21. Team mode (Pro): owner plus 1-2 staff, jobs assigned by voice, "job done" photo from staff
- [ ] H22. Multilingual replies: reply to customers in isiZulu or isiXhosa (test Whisper and the model on Zulu and Xhosa first); low-data mode
- [ ] H23. Paid upgrades for owners who switch: Facebook / Instagram Page messages and WhatsApp Business API (coexistence; 1,000 free service replies a month, then about R0.12 each, confirm on Meta's rate card)

## Phase 2
- Outlook / iCloud mail (Gmail is built, see SECURITY.md section 5), Google app verification so the weekly reconnect goes away
- Offline queue, re-generate with a different tone, team or shared business profiles
