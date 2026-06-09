# Architecture

## Components

- **`index.ts`** — bootstrap: run migrations, build the app, attach the Media Streams
  websocket, start the usage-metering interval, graceful shutdown.
- **`server/app.ts` (`createApp`)** — the Express app factory (helmet, CORS, rate limits,
  health, Stripe webhook with raw body, Twilio routes with signature verification, public
  auth routes, the authed API, static dashboard). Pure function → easy to test.
- **`pipeline/session.ts` (`CallSession`)** — one per live call. Bridges the Twilio Media
  Streams socket to the brain: barge-in, audio framing, marks, transfer/hangup control.
- **`pipeline/conversation.ts` (`Conversation`)** — transport-agnostic **brain**: streams
  the LLM, runs the tool loop, emits sentence-sized `say` events + `control` actions.
  Reused by the phone session and the text simulator.
- **`providers/`** — `SttProvider` / `LlmProvider` / `TtsProvider` interfaces, selected by
  env (`providers/index.ts`).
- **`agent/`** — `AgentConfig`, system-prompt builder, tool schemas + handlers.
- **`integrations/`** — `calendarProvider` (built-in Postgres calendar ↔ Google Calendar)
  and the outbound webhook (CRM/automation seam).
- **`server/`** — `auth` (admin token / tenant JWT / api_key), `authRoutes`
  (signup/login), `billing` (Stripe), `twiml` + `twilioVerify` + `twilioRest`.
- **`db/`** — Postgres `pool`, `migrate` (SQL files in `migrations/`), and an async
  repository (`index.ts`). Tables: tenants, agents, calls, transcript_turns, appointments,
  leads, calendar_connections.

## Call lifecycle (inbound)

1. Twilio POSTs `/twilio/inbound` (signature-verified). We resolve the agent by dialed
   number, **gate on tenant status/limit**, create a `calls` row, and return TwiML:
   `<Connect><Stream …>` with `agentId`/`callId` as `<Parameter>`s.
2. Twilio opens the WS, sends `start` with those params; `index.ts` loads the agent and
   builds a `CallSession`.
3. `begin()` opens STT and **speaks the greeting** (no LLM call).
4. Caller audio → STT. On an end-of-turn transcript, `Conversation.respondTo()`:
   streams the LLM → emits each completed **sentence** as a `say`; on a tool call, runs the
   handler, appends the result, and **loops** so the model can speak; `control`
   (transfer/hangup) is emitted after the closing line.
5. Each `say` → TTS → μ-law → Twilio in 160-byte (20ms) frames + a `mark`. The echoed
   `mark` tells us playback finished.
6. **Barge-in**: a caller transcript while marks are outstanding → `clear` to Twilio +
   abort the in-flight turn.
7. On hangup, the `calls` row is finalized (status, duration, outcome) → feeds usage/billing.

## Data & multi-tenancy

Every agent/call/lead/appointment carries a `tenant_id`. The auth layer attaches a
principal (admin or tenant); API queries are scoped so tenants only see their own rows. See
[SAAS.md](SAAS.md).

## Latency choices

μ-law/8kHz everywhere (no resampling) · sentence chunking (`takeSentence`) starts TTS
before the LLM finishes · `outstandingMarks` gate barge-in · `max_call_seconds` caps spend.

## Extending

- **New STT/LLM/TTS** → implement the interface in `providers/types.ts`, add to the factory.
- **Calendar** → `integrations/calendarProvider.ts` already routes built-in ↔ Google; add
  another (Cal.com) by implementing `findAvailability`/`book`.
- **New tool/action** → add a schema + handler in `agent/tools.ts`, list it in
  `enabled_tools`.
- **Schema change** → add a `migrations/NNNN_*.sql` file (applied in order on boot).
