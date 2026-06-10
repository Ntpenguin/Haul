# OpenVoice Agent — capabilities

Everything the platform can do today. It's a **self-hosted, multi-tenant AI phone-agent
SaaS** — an open recreation of GoHighLevel's Voice AI that you run and resell.

## 📞 On a phone call (the AI receptionist)
- **Answers inbound calls** on a Twilio number, 24/7, with a natural spoken conversation.
- **Places outbound calls** from the dashboard (or API).
- **Real-time, low-latency pipeline**: Twilio Media Streams ⇄ streaming STT ⇄ streaming
  LLM (tool-calling) ⇄ streaming TTS, all at μ-law/8kHz (no transcoding).
- **Barge-in**: the caller can interrupt the agent mid-sentence and it stops talking.
- **Speaks the greeting instantly** (no LLM round-trip) for a snappy answer.
- **Actions the agent can take** during a call:
  - **Check availability** against a calendar (built-in or Google).
  - **Book an appointment** at a confirmed time.
  - **Capture a lead** (name / phone / email / notes) into the CRM.
  - **Transfer to a human** (warm handoff via Twilio Dial).
  - **Trigger an automation** (outbound webhook to n8n/Zapier/Make/Mautic/GHL/etc.).
  - **End the call** politely.
- **Returning-caller recognition**: matches the caller's number to a prior lead, greets
  them by name, and skips re-asking for details it already has. The dashboard's call
  view shows the caller's full history (prior calls, bookings, leads).
- **Post-call SMS confirmation** to the caller after a booking (toggle per agent).
- **Appointment reminders**: automatic SMS 24h + 1h before the appointment (no-show
  reduction), per-agent toggle.
- **Self-serve reschedule/cancel links**: every confirmation + reminder text includes a
  secure `/manage/<token>` link where the customer can cancel or pick a new open slot —
  no app, no login. The owner is notified of changes.
- **Daily digest**: a once-a-day activity summary (calls, minutes, bookings, leads,
  voicemails) sent to the owner by **email and/or Slack** (incoming webhook), per-agent
  opt-in. Quiet days are skipped.
- **Multi-language**: set the agent's language (BCP-47) and it conducts the entire call
  in that language — wired through the prompt and speech recognition.
- **Owner/staff notifications** on new bookings and leads — by **SMS** and/or **email**.
- **Post-call email summary** (transcript + outcome) to the owner.
- **Call recording** (per-agent toggle) with in-dashboard playback.
- **Full transcript** of every call, saved and viewable.
- **Guardrails**: max-call-length cap; per-tenant monthly minute limit; calls declined for
  suspended/over-limit tenants.

## 💬 Two-way SMS agent
- The **same brain answers inbound texts**, not just calls — stateful per contact, can
  answer questions, capture leads, and book appointments over SMS.

## 🕗 Call handling & routing
- **Business hours** per agent (per-day open/close).
- **After-hours behavior**: keep answering with AI, **take a voicemail** (recorded +
  auto-transcribed + webhook + owner SMS), or **transfer** to a human.
- **Multi-number / multi-business**: each agent is routed by its own phone number, so one
  instance can serve many businesses.

## 🧠 Agent configuration (no code)
- **Persona / role**, **goals**, **greeting**, **knowledge base / FAQ**.
- **Voice picker** with audio preview (ElevenLabs voices or Deepgram Aura catalog) +
  **language**.
- **Enabled actions** (toggle which tools the agent may use).
- **Routed number**, **transfer-to number**, **owner notify number**, **automation
  webhook URL**.
- **Industry templates** — one-click presets for Moving/Labor, Home Services, Salon/Spa,
  Dental/Medical, and Restaurant.
- **Import knowledge base from a website** (scrape + summarize) **or from an uploaded
  file** (PDF / text).
- **Buy a phone number in-dashboard**: search available Twilio numbers by area code,
  purchase, and auto-wire the voice + SMS webhooks to the agent.
- **Onboarding wizard** for new accounts: pick a template → name the business → create the
  agent → connect a number → test it.
- **Text simulator**: talk to the agent's brain in the dashboard with no phone.

## 📅 Calendar
- **Built-in calendar** (Postgres) with no double-booking.
- **Google Calendar** integration per tenant (OAuth) — free/busy check + event creation;
  falls back to built-in until connected.
- Calendar backend is pluggable (Cal.com/others can be added behind the same interface).

## 🗂️ CRM & data
- **Leads**, **appointments**, **voicemails**, and **call logs** — all captured and viewable.
- **CSV export** of leads, appointments, and calls.
- **Outbound webhooks** push leads/bookings/workflows/voicemails to your stack in real time.

## 📊 Analytics
- Per-tenant dashboard: total calls, booked, **booked-rate**, minutes used, leads captured,
  transfers, average call length, and a 14-day call/booking chart.

## 🏢 Multi-tenant SaaS (resell it)
- **Self-serve signup + login** (email/password → JWT) and **per-tenant API keys**.
- **Strict data isolation** — tenants see only their own agents, calls, leads, bookings,
  voicemails, and usage.
- **Platform admin** role (manage all tenants, cross-tenant usage).
- **Stripe billing**: Checkout subscription + **metered per-minute** usage; webhooks keep
  tenant status in sync (active / past_due / canceled); a one-command setup script creates
  the products/prices.
- **Usage metering & gating**: monthly minutes per tenant; over-limit/suspended tenants are
  blocked from calls.
- **Isolation models**: shared instance (rows) or container-per-tenant (Coolify/Dokku).
- **White-label**: static dashboard you can rebrand; per-tenant subdomains/logins.

## 🔌 Provider-agnostic
- **Telephony**: Twilio. **STT**: Deepgram. **LLM**: OpenAI or Anthropic. **TTS**:
  ElevenLabs or Deepgram Aura. Swap each with one env var.
- **Mock providers** (`*_PROVIDER=mock`): run the entire stack — dashboard, simulator, even
  a real Twilio call — with **zero API keys** (demo/dev mode).

## 🛠️ Operations & quality
- **One-command deploy**: Docker Compose (app + Postgres + Caddy auto-HTTPS); also `fly.toml`.
- **Postgres** with a SQL migration runner.
- **Security**: helmet/CSP, CORS, rate limiting, **Twilio + Stripe signature verification**,
  bcrypt passwords, JWT auth, zod-validated fail-fast config, secret redaction in logs.
- **Observability**: structured (pino) logging, `/healthz` + `/readyz`, graceful shutdown.
- **Tested**: unit + API integration + a **full simulated phone call** through the real
  WebSocket pipeline, run in **CI** (GitHub Actions) against Postgres — all with no
  external APIs.

## 🌐 Interfaces
- **Operator/tenant dashboard** (SPA): agents, calls + transcripts + recordings, leads &
  bookings & voicemails, analytics, tenants (admin), billing, calendar connect, CSV export.
- **REST API** for everything (agents, calls, transcripts, leads, appointments, voicemails,
  usage, analytics, tenants, billing, calendar, templates, CSV, simulate, outbound).
- **Webhooks**: inbound Twilio (voice/recording/voicemail/status), Stripe; outbound to your
  CRM/automation.
