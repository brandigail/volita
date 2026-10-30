# Apex Voice: Pricing and plan limits (draft for Claude Code)

Status: NOT approved to build yet. Brandon will say "go" when ready to market. Until then, change nothing.
When he says go: read this file, then implement section 6 (in the revised order from section 8.5) step by step, tick each step in PLAN.md, and run build, lint and `tsc --noEmit` after each step.

## 1. Plans at a glance

| | Free ($0) | Basic ($5/mo or $50/yr) | Pro ($12/mo or $99/yr) |
|---|---|---|---|
| Voice drafts per day | 3 | 15 | 100 |
| Recording length | 60 s | 2 min | 5 min |
| Channels | Email, WhatsApp, Note | All 8 (adds Quote, SMS, Instagram, Facebook, TikTok) | All 8 |
| Languages | English only | All Whisper languages + translation | Same |
| Assistant turns per day | 5, browser voice only | 30 | 100 |
| Premium "Diana" voice | None | 200 turns / month, then browser voice | 600 turns / month, then browser voice |
| Assistant tools | Agenda read, draft search | + create draft, schedule send, mark sent, add meeting | + web lookup (30/day), everything |
| Memory (preferences, people) | None | 25 items + 25 contacts | Unlimited |
| Draft history | Last 20 drafts | Unlimited, search + filters | Unlimited |
| "Send at" reminders | No | Yes | Yes |
| Calendar link (iCal) | No (manual agenda only) | Yes, 1 calendar | Yes, up to 3 calendars |
| Signature footer | "Written with Apex Voice" added | Your own sign-off only | Your own sign-off only |
| Download / delete my data | Yes (always free) | Yes | Yes |
| Support | Feedback box | Email | Priority email |

Rule: the free plan must be good enough to prove the idea in one sitting, and annoying enough that daily use hits a wall (3 drafts, 5 assistant turns, no memory, footer on every draft).

## 2. Why people pay for each plan

**Basic ($5): "my phone writes my client messages."**
- All 8 channels, so quotes, WhatsApp and social posts are unlocked.
- Longer recordings, any language, translation (Afrikaans etc.).
- The hands-free assistant with real tools (agenda, create drafts, mark as sent).
- Premium voice for the first 200 turns a month.
- Memory: it remembers clients and preferences; saved contacts fill in email and phone.
- "Send at" reminders and calendar link so drafts show up on the agenda at the right time.
- No Apex footer on your drafts.

**Pro ($12): "it runs my admin."**
- 5 minute recordings, 100 drafts a day, 100 assistant turns a day.
- 600 premium voice turns a month.
- Unlimited memory.
- Web lookup in the assistant.
- Features that make it a daily habit (to be built, see section 4): morning briefing, learns your writing style, regenerate in a different tone, send from inside Apex, inbox awareness.
- Several calendars, priority support.

## 3. Price check against similar tools (US list prices, found 2026-10-29)

| Tool | Free | Paid |
|---|---|---|
| Wispr Flow (dictation) | about 2,000 words/week on desktop (about 750 on iPhone) | Pro $15/mo or $144/yr |
| Willow Voice (dictation) | 2,000 words/week | $15/mo or $12/mo billed yearly |
| Superwhisper (dictation) | Free tier, small models, no numeric cap found | $8.49/mo, $84.99/yr, $249.99 lifetime |
| Otter.ai (meeting notes) | 300 min/month | Pro $16.99/mo or $99.99/yr; Business $30/mo (figures from a competitor's blog, unverified) |
| Apex Voice (proposed) | 3 drafts/day | Basic $5, Pro $12 ($99/yr) |

Not verified: ChatGPT / Gemini pricing. Check before quoting it.

## 4. How Apex is different and better

Dictation tools (Wispr, Willow, Superwhisper) type words into any app. Otter writes meeting notes. General chat assistants answer questions. None of them are built around the whole job of a small business owner: speak a note, get a finished message in the right style for the right channel, send it, track that it was sent, remind me later, and remember who the client is.

What to push:
1. **Whole workflow in one app:** voice, draft, send, tracked as sent, on the agenda, searchable ("did I send Mr Smith his quote?"). Nobody in the table does this.
2. **Remembers people and preferences,** encrypted, and the user can read, edit and delete it.
3. **Channel-aware writing:** quote with prices and signature, Instagram caption with hashtags, casual WhatsApp.
4. **Built for South Africa:** ZAR pricing (the app already converts live), PayFast checkout, Afrikaans, Android app that keeps listening with the screen off.
5. **Price:** Basic is about a third of what Wispr or Willow charge for the main plan.

Honest weaknesses to fix or be upfront about:
- Wispr and Superwhisper type into every app on a computer. Apex does not (it is its own app).
- Encryption, security headers and delete-account are built but not deployed yet (see SECURITY.md). Deploy them before taking any money.
- Groq free quota will not carry paying users. Move to paid Groq before launch.
- Pro features in section 4 of PLAN.md (C5, C6, C7, send-from-Apex) are not built. Do not advertise a feature until it ships.

## 5. Cost check (rough, from Groq list prices, Oct 2026; verify with the activity log)

Groq prices: Whisper Large V3 Turbo $0.04 per audio hour; Orpheus speech $22 per 1M characters; gpt-oss-120b $0.15 in / $0.60 out per 1M tokens; the draft model (Qwen) $0.80 in / $4.00 out per 1M tokens.

Assumptions: spoken reply about 400 characters, a draft about 1,500 tokens in and 400 out.
- One premium-voice assistant turn: about $0.01 (speech is roughly 90% of that).
- One browser-voice assistant turn: about $0.001.
- One draft: about $0.003 plus transcription pennies.

So premium voice is the expensive part, which is why it is a monthly pool and not unlimited. Estimated maximum monthly cost if someone uses every allowance: Basic about $4.5, Pro about $12. Real users use a fraction of that, but watch the numbers and adjust the pools. PayFast fees and tax come on top.

## 6. Build steps for Claude Code (only when Brandon says go)

1. Add plan tiers to `src/types/plans.ts`: `free | basic | pro`, new prices ($0, $5, $12), annual prices, perks matching section 1. Keep the live currency conversion.
2. Add a `limits` object per plan (drafts per day, recording seconds, assistant turns per day, premium voice per month, memory item caps, channels, languages, history length, calendars) in one shared file used by client and functions.
3. Make `rate-limit.ts` `limitsFor(endpoint)` take the user's plan. Add monthly counters for premium voice turns (migration 013).
4. Enforce server-side only (never trust the client): channels and languages in `generate.ts` and `transcribe.ts`, recording length in `transcribe.ts`, tool lists per plan in `assistant-tools.ts`, memory caps in `memory.ts` and `contacts.ts`, calendar count in `calendar.ts`, history length in `db-sync.ts`.
5. `speak.ts`: when the premium pool is used up (or plan is free), return a flag so the client uses the browser voice instead of failing.
6. Free plan: append "Written with Apex Voice" to drafts; hide locked channels with a clear upgrade prompt, not an error.
7. Upgrade UI: show remaining drafts and assistant turns today, and a plan comparison screen with the three plans.
8. Subscriptions: make Free the default plan for new accounts; upgrade, downgrade and cancel via PayFast; downgrade keeps data but locks features above the plan.
9. Finish B7b (own PayFast merchant, live mode, privacy / terms / refund pages) before charging anyone.
10. Then build the Pro features: C6 morning briefing, C5 writing style, regenerate in a different tone, send from inside Apex, C7 inbox awareness.
11. Update README, PLAN.md and SECURITY.md. Run build, lint and `tsc --noEmit`. Test each plan with a test account on the live site.

## 8. Review against the real app (added 2026-10-30, still NOT approved to build)

Checked by reading the code: `plans.ts`, `rate-limit.ts`, `features.ts`, `transcribe.ts`, `speak.ts`, the assistant tool files, migrations 001 to 012, `payfast.ts`. Nothing in the app was changed.

### 8.1 Corrections to this document
- Build steps are section 6 (the header used to say section 5). Fixed.
- `src/types/plans.ts` today has only `basic` ($5) and `pro` ($10, "not enforced yet"). This plan says Pro is $12 and adds `free`. Step 1 changes the price and adds the tier.
- Recording is already 5 minutes for everyone (`MAX_RECORDING_SECONDS = 300` in the client, no server check). Free (60 s) and Basic (2 min) are a take-away, so they must be enforced in `transcribe.ts` as well as in the recorder hook.
- All limits are flat today (the same for every user, `ASSISTANT_DAILY_LIMIT` is the only knob). Nothing knows about plans yet. `FEATURE_SUBSCRIPTIONS` only hides the subscription screen.

### 8.2 Things that would break the plan as written (fix in the design)
1. **Drafts per day is not the same as `transcribe` calls.** A recording is cut into 45 s pieces, one `transcribe` call each (a 5 minute clip is about 7 calls; the current cap is 120 a day). Count drafts on `generate`, and meter `transcribe` by audio seconds per day (Free 3 x 60 s, Basic 15 x 120 s, Pro 40 x 300 s), not by call count. Otherwise Pro (40 five-minute drafts is about 280 calls) hits the old cap.
2. **An assistant turn is several calls** (`listen`, `assistant`, then one `speak` per sentence). Define one turn as one `assistant` call, and have the client send the turn's id on its `speak` calls, so the premium pool counts turns, not sentences.
3. **Monthly counters need their own table.** `api_usage` is pruned after 3 days and its windows are rolling 24 hours, not calendar days. Add migration 013 with a per-user, per-month counter. Say "in 24 hours" in the UI, or reset at local midnight; pick one before building the usage meter.
4. **Downgrade rule: lock, never delete.** Over-cap memory, contacts, history and calendars become read-only; the user can still view, download and delete them. Add this to step 8.
5. **The free footer is editable.** The draft card is editable, so a user can delete "Written with Apex Voice". Accept that, and add the footer server-side in `generate` so it is on by default.
6. **Plan resolution lives in one place:** `getPlan(userId)` in `_lib/`, reading a `plan` column plus an `OWNER_EMAILS` env override (dad gets Pro free, same pattern as `features.ts`). Every function calls it; the client only displays.

### 8.3 Blockers that are not code
| Blocker | Why | Action for Brandon |
|---|---|---|
| Groq free quota | Cannot carry paying users | Move to paid Groq. It needs a card, so it is your decision. Turn on Zero Data Retention at the same time |
| Netlify credits | 75% used, reset 2026-11-10; the security build is waiting on this | Batch everything into one deploy after the reset |
| Own PayFast merchant (B7b) | Needs business verification by PayFast; the sandbox only proves the flow | Start the application now, it is the longest wait |
| Pending security work | Encryption, headers, delete-account are built but not deployed | Deploy first. No money is taken before this |
| Legal pages | Privacy, terms and refund pages are needed by PayFast and POPIA | Written in step 9 |

### 8.4 Can each new idea be done? (free tier, Groq, Neon, Netlify only)
| Idea | Verdict | Notes |
|---|---|---|
| Pop-up notifications | Yes, in two stages | Android: Capacitor Local Notifications, scheduled from `sendAt` and agenda items, own high-importance channel. Web/iPhone: only while the app is open until web push exists (needs VAPID keys and a Netlify scheduled function; free but uses credits). Say so honestly in the UI |
| Plans with server-enforced limits | Yes | Section 6 steps 1 to 8, with 8.2 applied |
| Owner override | Yes, small | `OWNER_EMAILS` env, see 8.2 point 6 |
| Usage meter | Yes, small | Read counts from `api_usage` and the monthly table |
| Three-question onboarding | Yes, small | Writes profile and first memories; no new service |
| Source-tagged memory | Yes, small | Add a `source` column (`said` / `guessed`) in migration 013; the profile list shows a "tap to fix" mark |
| Price list and services | Yes, medium | New encrypted `services` table; the assistant asks when a price is missing; feeds quotes |
| Saved templates and phrases | Yes, small | Table plus a picker on the draft screen; Basic and up |
| Photo to caption | Yes, medium | Needs a Groq vision model (check Groq's current model list first); Basic and up |
| Quote to PDF | Yes, small | Client-side PDF library, no server cost |
| Follow-up nudges | Yes, after notifications | Needs notification stage 1; the sent state already exists |
| WhatsApp list for tomorrow's reminders | Yes, small | `wa.me` links built from the To send list |
| Share a WhatsApp message or voice note into Apex | Android only | Web Share Target in the manifest plus an intent filter in the Capacitor app. iPhone Safari does not support it. Voice notes are `.opus`, which Whisper accepts |
| Payment link on quotes | Later | Needs the live PayFast merchant and a per-quote payment page |
| Inbox awareness (C7) | Later, blocked | Needs the security deploy and two-step login first |
| Send from inside Apex | Later | Gmail API needs Google app verification (weeks). Resend with reply-to is the quick route |
| Annual billing | Yes | PayFast subscriptions have a frequency field; Basic $50 and Pro $99 are separate yearly products. Sandbox first |

### 8.5 Revised build order (replaces the order in section 6)
Each stage is shippable alone; run build, lint and `tsc --noEmit` after each.
- **Stage 0, prerequisites:** the 8.3 table. Deploy the pending security build on or after 2026-11-10.
- **Stage 1, plan engine:** `plans.ts` with `free`; shared `limits.ts`; `getPlan()`; migration 013 (plan column, monthly counters, memory source); server enforcement per 6.4; premium-voice fallback flag; free footer. Test with one account per plan.
- **Stage 2, what users see:** usage meter, plan comparison screen, locked-channel upgrade prompts, owner override, three-question onboarding.
- **Stage 3, notifications:** Android local notifications, Settings toggles with a test button, in-app reminders on web. Test on a real phone with battery saver on.
- **Stage 4, money:** B7b merchant, live mode, legal pages, upgrade, downgrade, cancel, annual plans.
- **Stage 5, Pro habit features:** C6 morning briefing, tone regenerate, C5 writing style, templates, price list, quote to PDF, WhatsApp list.
- **Stage 6, later:** photo to caption, share into Apex, follow-up nudges, web push, send from inside Apex, C7, payment links.

Do not advertise any stage 5 or 6 item until it ships.

## 9. Built so far (2026-10-30, demo stage: no billing, no deploy)

Decisions made while building: Pro is $12 / $99 a year with **100 drafts and 100 assistant turns a day** (changed from 40 and 80 on Brandon's say-so); the daily time for the briefing and the quote nudge can be any minute (for example 08:03); refusals for plan limits use HTTP 402 and carry the plan that unlocks them; accounts that existed before plans were introduced were given Pro by migration 013; the owner screen can also give a plan to an email address before that person signs up (`plan_invites`), so about 20 family and friends can be approved in one paste.

Built: sections 6 steps 1 to 7 and 10 (plan tiers and limits in one shared file, `getPlan` on the server, enforcement in every function, premium voice pool per assistant turn with device-voice fallback, free footer, usage meter and plan screen, locked-feature prompts instead of errors, morning briefing, tone rewrite, writing style, templates, price list, quote PDF, photo to caption, follow-up nudges, WhatsApp list for tomorrow, three-question welcome, source-tagged memory, share into Apex, pop-up notifications). Not built, on purpose: step 8 billing (upgrade, cancel, annual checkout), step 9 (own PayFast merchant, legal pages), web push, send from inside Apex, inbox awareness, payment links on quotes.
