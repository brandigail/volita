# Apex Voice: Pricing and plan limits (draft for Claude Code)

Status: NOT approved to build yet. Brandon will say "go" when ready to market. Until then, change nothing.
When he says go: read this file, then implement section 5 step by step, tick each step in PLAN.md, and run build, lint and `tsc --noEmit` after each step.

## 1. Plans at a glance

| | Free ($0) | Basic ($5/mo or $50/yr) | Pro ($12/mo or $99/yr) |
|---|---|---|---|
| Voice drafts per day | 3 | 15 | 40 |
| Recording length | 60 s | 2 min | 5 min |
| Channels | Email, WhatsApp, Note | All 8 (adds Quote, SMS, Instagram, Facebook, TikTok) | All 8 |
| Languages | English only | All Whisper languages + translation | Same |
| Assistant turns per day | 5, browser voice only | 30 | 80 |
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
- 5 minute recordings, 40 drafts a day, 80 assistant turns a day.
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
