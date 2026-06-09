# OpenVoice Agent

A **self-hosted, open-source AI phone agent** — an open recreation of GoHighLevel's
"Voice AI" feature. It answers (and places) phone calls, holds a natural spoken
conversation, **books appointments**, **captures leads**, **transfers to a human**, and
**triggers your CRM/automation webhooks** — all running on infrastructure you control,
so you pay only the underlying provider usage instead of a per-minute SaaS markup.

> Built to be **provider-agnostic**: swap the speech-to-text, LLM, or text-to-speech
> engine with one env var. Defaults: **Twilio** (telephony) · **Deepgram** (STT) ·
> **OpenAI or Anthropic** (brain) · **ElevenLabs or Deepgram Aura** (voice).

---

## What GoHighLevel's Voice AI does (and how this maps to it)

GHL's Voice AI is an AI receptionist you configure with a persona, goals, a knowledge
base, a voice, and a set of **actions**. It answers your business number, talks to the
caller, and takes actions (book on a calendar, transfer, capture contact info, fire a
workflow). It's billed **per minute**. This project reimplements that model:

| GoHighLevel Voice AI | OpenVoice Agent |
|---|---|
| Agent persona / prompt | `persona` + `goals` (→ system prompt) |
| Knowledge base / FAQ | `knowledge_base` field |
| Voice & language | `voice_id` + `language` (ElevenLabs/Deepgram voices) |
| Greeting | `greeting` field, spoken with zero LLM latency |
| **Action: book appointment** (real-time calendar) | `book_appointment` + `check_availability` tools (built-in calendar, swappable for Cal.com/Google) |
| **Action: transfer to human** | `transfer_call` tool → Twilio `<Dial>` |
| **Action: collect contact info → CRM** | `capture_lead` tool → DB + outbound webhook |
| **Action: trigger workflow** | `trigger_workflow` tool → outbound webhook |
| Business hours / after-hours routing | `business_hours` + `after_hours` |
| Call logs, transcripts, recordings | Per-call transcript table + dashboard |
| Per-minute billing | You pay Twilio + STT/LLM/TTS at cost (see [cost notes](docs/RESEARCH.md#cost)) |

Full feature research and a cost comparison are in **[docs/RESEARCH.md](docs/RESEARCH.md)**.

---

## How it works (real-time pipeline)

```
   Caller ──PSTN──> Twilio Number
                       │  (TwiML: <Connect><Stream>)
                       ▼
        Twilio Media Streams  (WebSocket, μ-law 8kHz, 20ms frames)
                       │ ▲
              caller   │ │  agent
               audio   ▼ │  audio
   ┌───────────────────────────────────────────────┐
   │              OpenVoice Agent (Node)            │
   │                                                │
   │   STT (Deepgram, streaming) ──► transcript     │
   │            │                                   │
   │            ▼                                   │
   │   Brain: LLM + tool-calling loop  ◄── tools:   │
   │   (OpenAI / Anthropic, streaming)   book_appt, │
   │            │                        transfer,  │
   │            ▼  sentence-by-sentence  capture…   │
   │   TTS (ElevenLabs / Aura) ──► μ-law audio out  │
   └───────────────────────────────────────────────┘
```

Key design choices for **low latency** and **natural turn-taking**:

- Everything stays at **μ-law / 8 kHz** end-to-end — Deepgram ingests Twilio's native
  format, and ElevenLabs/Aura emit `ulaw_8000` directly, so there's **no resampling**.
- The LLM is **streamed and chunked by sentence**; each finished sentence is sent to TTS
  immediately rather than waiting for the whole reply.
- **Barge-in**: if the caller starts talking while the agent is speaking, we send Twilio a
  `clear` to flush queued audio and the agent stops mid-sentence.
- A **multi-hop tool loop** lets the model call `check_availability`, read the result, then
  call `book_appointment`, then speak a confirmation — all within one turn.

Architecture details: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Quick start

```bash
git clone <this-repo> && cd voice-agent
cp .env.example .env          # fill in the keys for the providers you use
npm install
npm run seed                  # creates a demo agent ("Ava")
npm run dev                   # http://localhost:3000  (dashboard)
```

Open the dashboard, pick the **Ava** agent, and use **Test the agent (text simulator)** to
talk to the brain with **no phone and no telephony keys** — only an LLM key is needed for
that. (The simulator runs the exact same LLM + tool loop the phone uses.)

### Going live on a real phone number

1. Set `PUBLIC_BASE_URL` in `.env` to a public HTTPS URL that reaches this server.
   For local testing: `ngrok http 3000` (or `cloudflared tunnel`), then paste the URL.
2. In the **Twilio Console** → your phone number → **A call comes in** → Webhook:
   `https://YOUR_PUBLIC_URL/twilio/inbound` (HTTP POST).
3. In the dashboard, set that number on your agent (**Routed phone number**).
4. Call the number. 🎉

Outbound calls: open an agent → **Place an outbound call** → enter a number.

### Self-hosting with Docker

```bash
cp .env.example .env          # fill in keys + PUBLIC_BASE_URL
docker compose up -d --build
```

See **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)** for VPS, HTTPS/tunnel, and
multi-agent (multi-business) notes.

### Reselling it (SaaS / multi-tenant mode)

Built in: **tenants** (reseller "sub-accounts"), per-tenant **API keys** with full data
isolation, and **usage metering** with monthly minute limits + outbound gating for
billing. One instance can serve many client businesses, or you can run a
container-per-tenant for hard isolation. Full guide: **[docs/SAAS.md](docs/SAAS.md)**.

---

## Configuration

All agent behavior is data, editable in the dashboard or via the REST API
(`src/agent/types.ts` is the source of truth):

- **persona / goals / knowledge_base** — the brain
- **greeting / voice_id / language** — how it sounds
- **enabled_tools** — which actions the agent may take
- **transfer_number / webhook_url** — where escalations and captured data go
- **business_hours / after_hours / max_call_seconds** — guardrails

Provider selection + keys live in `.env` (`LLM_PROVIDER`, `TTS_PROVIDER`, etc.).

---

## REST API (also used by the dashboard)

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/agents` | list / create agents |
| GET/PUT/DELETE | `/api/agents/:id` | read / update / delete an agent |
| GET | `/api/calls` | call log |
| GET | `/api/calls/:id/transcript` | full transcript |
| GET | `/api/leads`, `/api/appointments` | captured CRM data |
| POST | `/api/calls/outbound` | place an outbound call `{agentId,to}` |
| POST | `/api/simulate` | drive the brain over text `{agentId,sessionId?,message}` |
| GET/POST/PUT/DELETE | `/api/tenants` | manage reseller sub-accounts (**admin only**) |
| GET | `/api/usage` | per-tenant call-minute usage (for billing) |
| POST | `/twilio/inbound` | Twilio inbound webhook (returns TwiML) |
| WS | `/twilio/stream` | Twilio Media Streams audio socket |

Auth: `/api/*` accepts either the platform `ADMIN_TOKEN` (full access + tenant management)
or a **tenant's `api_key`** (auto-scoped to that tenant's data). The `/twilio/*` webhooks
stay open for Twilio. See **[docs/SAAS.md](docs/SAAS.md)**.

---

## Project layout

```
src/
  config.ts            env + derived URLs
  index.ts             HTTP + WebSocket server wiring
  agent/
    types.ts           AgentConfig (the GHL-equivalent agent model)
    prompt.ts          system-prompt builder
    tools.ts           tool schemas + handlers (book/transfer/capture/…)
  providers/           swappable STT / LLM / TTS implementations
    stt/deepgram.ts  llm/{openai,anthropic}.ts  tts/{elevenlabs,deepgram}.ts
  pipeline/
    conversation.ts    LLM + tool loop, streamed & sentence-chunked (the brain)
    session.ts         per-call audio bridge with barge-in (Twilio ⇄ pipeline)
  server/
    twiml.ts           Twilio webhooks (inbound/outbound/status)
    api.ts             REST API + text simulator
    twilioRest.ts      Twilio REST (transfer / hangup / outbound)
  db/                  SQLite (agents, calls, transcripts, leads, appointments)
  integrations/        calendar + outbound webhook (CRM/automation seam)
public/                dashboard SPA (vanilla JS)
scripts/               seed + selftest
```

## Testing without spending money

- `npm run selftest` — drives the full **book-an-appointment** tool loop with a **stubbed
  LLM** (no API keys, no telephony). Verifies the brain end-to-end.
- The dashboard **text simulator** — talk to a real LLM with no phone.

---

## License

MIT. You can host it, modify it, and use it commercially. This is an independent
reimplementation of a *concept*; it is not affiliated with or derived from GoHighLevel.
You are responsible for your own use of third-party APIs (Twilio, OpenAI, etc.) and for
call-recording / consent laws in your jurisdiction.
