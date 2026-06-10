# OpenVoice Agent

A **self-hosted, multi-tenant AI phone-agent platform** — an open, hostable recreation of
GoHighLevel's "Voice AI". It answers (and places) phone calls, holds a natural spoken
conversation, **books appointments** (built-in or Google Calendar), **captures leads**,
**transfers to a human**, and **fires CRM/automation webhooks** — on infrastructure you
own, so you pay only the underlying provider usage instead of a per-minute SaaS markup.

It's built to **resell**: per-tenant sign-up + login, data isolation, Stripe subscription
billing with metered minutes, and one-command Docker deployment with automatic HTTPS.

> Provider-agnostic — swap STT / LLM / TTS with one env var. Defaults: **Twilio**
> (telephony) · **Deepgram** (STT) · **OpenAI or Anthropic** (brain) · **ElevenLabs or
> Deepgram Aura** (voice). Data in **Postgres**.

---

## What it does vs. GoHighLevel Voice AI

| GoHighLevel Voice AI | OpenVoice Agent |
|---|---|
| Agent persona / prompt / goals | `persona` + `goals` → system prompt |
| Knowledge base / FAQ | `knowledge_base` field |
| Voice & language | `voice_id` + `language` (ElevenLabs/Deepgram voices) |
| Greeting | spoken with zero LLM latency |
| **Book appointment** (real-time calendar) | `book_appointment` + `check_availability` → **Google Calendar** or built-in |
| **Transfer to human** | `transfer_call` → Twilio `<Dial>` |
| **Collect contact info → CRM** | `capture_lead` → DB + outbound webhook |
| **Trigger workflow** | `trigger_workflow` → outbound webhook (n8n / Mautic / GHL / Zapier) |
| Business hours / after-hours | `business_hours` + `after_hours` |
| Call logs, transcripts | per-call transcript + dashboard |
| Per-minute billing | self-serve Stripe subscription + **metered minutes**; you pay providers at cost |
| Sub-accounts (SaaS mode) | **tenants** with isolation + per-tenant API keys/logins |

Feature research + cost comparison: **[docs/RESEARCH.md](docs/RESEARCH.md)**.

---

## Real-time pipeline

```
 Caller ──PSTN──> Twilio Number ──TwiML <Connect><Stream>──┐
                                                           ▼
        Twilio Media Streams (WebSocket, μ-law 8kHz, 20ms) │ ▲
                                                   caller   ▼ │ agent audio
   ┌───────────────────────────────────────────────────────────┐
   │   STT (Deepgram, streaming)  →  Brain: LLM + tool loop      │
   │   (OpenAI/Anthropic)  →  TTS (ElevenLabs/Aura)  → caller    │
   └───────────────────────────────────────────────────────────┘
```

μ-law/8kHz end-to-end (no resampling) · LLM streamed + **sentence-chunked** to TTS ·
**barge-in** (caller can interrupt) · multi-hop tool loop. Details:
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Quick start (local dev)

Requires Node 20+ and Postgres. Easiest is the bundled compose Postgres, or point
`DATABASE_URL` at any Postgres.

```bash
cp .env.example .env            # set DATABASE_URL + the provider keys you use
npm install
npm run migrate                 # create the schema
npm run seed                    # demo agent "Ava"
npm run dev                     # http://localhost:3000
```

Open the dashboard → sign up (or use your `ADMIN_TOKEN`) → pick an agent →
**Test the agent (text simulator)** to talk to the brain.

### Try it with zero API keys (demo mode)

Set `STT_PROVIDER=mock`, `LLM_PROVIDER=mock`, `TTS_PROVIDER=mock` in `.env`. A rule-based
receptionist then drives the **entire flow** — greeting, checking availability, booking,
lead capture, transfer, and hangup — so the dashboard simulator (and even a real Twilio
call) work with **no provider keys at all**. Great for demos and local development.

`npm run selftest` runs the booking flow against a stubbed LLM, and `npm test` includes a
**full simulated phone call** through the real WebSocket pipeline (greeting → barge-in →
booking → hangup) — all with no external APIs.

### Go live on a phone number

1. Set `PUBLIC_BASE_URL` to a public HTTPS URL (your domain, or `ngrok http 3000`).
2. Twilio Console → your number → **A call comes in** → Webhook (POST):
   `https://YOUR_URL/twilio/inbound`.
3. In the dashboard set that number on the agent (**Routed phone number**). Call it.

---

## Deploy (production)

One command brings up the app + Postgres + Caddy (automatic HTTPS):

```bash
cp .env.example .env            # set DOMAIN, ADMIN_TOKEN, JWT_SECRET, PUBLIC_BASE_URL, keys
docker compose up -d --build
```

Also ships a `fly.toml` (Fly.io) and works on Render/Railway. Full guide incl. TLS,
Twilio signature, Stripe webhook, and Google OAuth setup:
**[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)** · reselling & isolation:
**[docs/SAAS.md](docs/SAAS.md)**.

---

## Reselling it (SaaS / multi-tenant)

- **Self-serve**: `POST /api/auth/signup` + `/login` issue tenant JWTs; the dashboard has
  the sign-up/login UI. Tenants are fully isolated and only see their own agents, calls,
  leads, appointments, and usage.
- **Billing**: Stripe Checkout subscription + optional **metered per-minute** overage;
  webhooks keep tenant status in sync (active / past_due / canceled); calls are **gated**
  on tenant status + monthly minute limit.
- **Usage metering**: `/api/usage` sums monthly minutes per tenant; reported to Stripe
  automatically on an interval.

---

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup`, `/api/auth/login` | tenant self-serve auth → JWT (public) |
| GET/POST | `/api/agents`, GET/PUT/DELETE `/api/agents/:id` | agent CRUD (tenant-scoped) |
| GET | `/api/calls`, `/api/calls/:id/transcript` | call log + transcripts |
| GET | `/api/leads`, `/api/appointments` | captured CRM data |
| POST | `/api/calls/outbound` | place an outbound call `{agentId,to}` |
| POST | `/api/simulate` | drive the brain over text (no telephony) |
| GET | `/api/usage` | per-tenant minute usage |
| POST | `/api/billing/checkout` | start a Stripe subscription (tenant) |
| GET/POST | `/api/calendar/status`, `/api/calendar/google/connect` | Google Calendar OAuth |
| GET/POST/PUT/DELETE | `/api/tenants` | manage sub-accounts (**admin only**) |
| POST | `/twilio/inbound`, `/twilio/status` | Twilio webhooks (signature-verified) |
| POST | `/webhooks/stripe` | Stripe webhook (signature-verified) |
| WS | `/twilio/stream` | Twilio Media Streams audio socket |
| GET | `/healthz`, `/readyz` | liveness / readiness |

Auth on `/api/*`: platform `ADMIN_TOKEN`, a tenant **JWT**, or a tenant **`api_key`**.

---

## Project layout

```
src/
  config.ts            zod-validated, fail-fast env
  index.ts             server bootstrap (migrate, http, websocket, shutdown)
  agent/               AgentConfig model, system-prompt builder, tools
  providers/           swappable STT / LLM / TTS
  pipeline/            conversation.ts (brain) + session.ts (audio bridge, barge-in)
  server/
    app.ts             Express app factory (helmet, cors, rate-limit, routes)
    api.ts authRoutes.ts auth.ts billing.ts twiml.ts twilioVerify.ts twilioRest.ts
  integrations/        calendarProvider (built-in ↔ Google) + outbound webhook
  db/                  Postgres pool + migration runner + repository
migrations/            SQL migrations
public/                dashboard SPA
tests/                 vitest unit + API integration (supertest)
```

## Quality

- `npm run typecheck` · `npm run build` · `npm test` (vitest) · `npm run selftest`.
- CI (`.github/workflows/ci.yml`) runs all of the above against a Postgres service.

## License

MIT. Independent reimplementation of a *concept*; not affiliated with GoHighLevel. You're
responsible for third-party API use (Twilio/OpenAI/etc.) and call-recording/consent laws.
