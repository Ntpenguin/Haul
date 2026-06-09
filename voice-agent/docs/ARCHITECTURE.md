# Architecture

## Components

- **`server/index.ts`** — one Node process running an Express HTTP server (webhooks +
  REST + static dashboard) and a `ws` WebSocket server on `/twilio/stream`.
- **`pipeline/session.ts` (`CallSession`)** — one instance per live call. Bridges the
  Twilio Media Streams socket to the brain and back. Owns barge-in, audio framing, marks,
  and call-control (transfer/hangup).
- **`pipeline/conversation.ts` (`Conversation`)** — the transport-agnostic **brain**: runs
  the streaming LLM, executes the tool loop, and emits sentence-sized `say` events plus
  `control` actions. Reused verbatim by the text simulator.
- **`providers/`** — `SttProvider`, `LlmProvider`, `TtsProvider` interfaces with swappable
  implementations selected by env (`providers/index.ts` factories).
- **`agent/`** — the `AgentConfig` model, the system-prompt builder, and the tool schemas +
  handlers.
- **`db/`** — SQLite (via `better-sqlite3`): agents, calls, transcript_turns, leads,
  appointments.
- **`integrations/`** — the built-in calendar and the outbound webhook (the CRM seam).

## Call lifecycle (inbound)

1. Twilio POSTs `/twilio/inbound`. We resolve the agent by the dialed number, create a
   `calls` row, and return TwiML: `<Connect><Stream url="wss://…/twilio/stream">` with
   `agentId`/`callId` as `<Parameter>`s.
2. Twilio opens the WebSocket and sends a `start` frame (with the custom parameters).
   `index.ts` reads them, loads the agent, and constructs a `CallSession`.
3. `CallSession.begin()` opens the STT stream and **speaks the greeting** (no LLM call).
4. Caller audio (`media` frames, base64 μ-law) → STT. On an end-of-turn transcript,
   `Conversation.respondTo()` runs:
   - stream LLM → buffer text → emit each completed **sentence** as a `say`;
   - on a tool call, execute the handler, append the result, and **loop** so the model can
     read the result and speak;
   - tool `control` (transfer/hangup) is emitted *after* the closing line is spoken.
5. Each `say` is synthesized to μ-law and streamed to Twilio in 160-byte (20ms) frames,
   followed by a `mark`. Twilio echoes the `mark` when playback finishes → that's how we
   know the agent is done talking.
6. **Barge-in**: a caller transcript arriving while marks are outstanding triggers a
   `clear` to Twilio and aborts the in-flight `say`/turn.
7. On `stop`/hangup, the `calls` row is finalized with status, duration, and outcome.

Outbound is the same pipeline; we place the call via Twilio REST pointing at
`/twilio/outbound-twiml`, which returns the same `<Connect><Stream>`.

## Turn-taking & latency notes

- μ-law/8kHz everywhere → no resampling on either leg.
- Sentence chunking (`takeSentence`) flushes on `.?!`, newlines, or long run-ons so TTS
  starts before the LLM finishes.
- `outstandingMarks` (a `Set`) is the single source of truth for "is the agent speaking",
  used to gate barge-in.
- `max_call_seconds` hard-caps call length to bound spend.

## Extending

- **New STT/LLM/TTS** → implement the interface in `providers/types.ts`, add it to the
  factory in `providers/index.ts`, and select via env.
- **Real calendar** (Cal.com, Google) → reimplement `integrations/calendar.ts`
  (`findAvailability`, `isSlotOpen`, `book`). Nothing else changes.
- **New action/tool** → add a schema + handler in `agent/tools.ts` and list it in the
  agent's `enabled_tools`.
- **Multi-tenant** → each `AgentConfig` already maps to a phone number; run one process
  for many agents/businesses, or one container per tenant (see SELF_HOSTING.md).
