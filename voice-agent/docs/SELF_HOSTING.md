# Self-hosting

## 1. Prerequisites

- A server reachable over **public HTTPS** (Twilio must POST to it and open a WSS
  connection). A small VPS is plenty — this is I/O-bound, not CPU-bound.
- A **Twilio** account + a voice-capable phone number.
- API keys for your chosen **STT / LLM / TTS** providers.

## 2. Run with Docker (recommended)

```bash
cp .env.example .env        # fill keys + PUBLIC_BASE_URL
docker compose up -d --build
```

The SQLite DB persists in the `./data` volume. Create your first agent in the dashboard
(or run `npm run seed` in a local dev checkout to get the demo "Ava" agent).

### Getting a public HTTPS URL

- **Own domain + reverse proxy**: put Caddy/Traefik/nginx in front, terminate TLS, proxy
  `:3000`. Make sure your proxy **forwards WebSocket upgrades** on `/twilio/stream`.
- **No domain**: use a tunnel.
  - Cloudflare Tunnel: uncomment the `tunnel` service in `docker-compose.yml` and set
    `TUNNEL_TOKEN`. Point a hostname at `http://voice-agent:3000`.
  - `ngrok http 3000` (dev/testing) — copy the https URL into `PUBLIC_BASE_URL`.

Set `PUBLIC_BASE_URL` to that HTTPS origin (no trailing slash); the app derives the
`wss://…/twilio/stream` URL from it automatically.

## 3. Wire up Twilio

1. Twilio Console → **Phone Numbers → your number → Voice → A call comes in**:
   - Webhook: `https://YOUR_DOMAIN/twilio/inbound` · HTTP **POST**.
   - (Optional) Status callback: `https://YOUR_DOMAIN/twilio/status`.
2. In the dashboard, set that E.164 number as the agent's **Routed phone number**.
   - With exactly one agent, inbound calls route to it automatically.
   - With several, each agent is matched by its routed number → **multi-business** on one
     instance.

## 4. Security

- Set **`ADMIN_TOKEN`** so `/api/*` (and the dashboard) require a bearer token. The
  `/twilio/*` webhooks stay open because Twilio can't send a bearer — for production,
  additionally **validate the `X-Twilio-Signature`** header (add middleware on
  `/twilio`) and/or restrict inbound to Twilio's IP ranges.
- Put the whole thing behind HTTPS. Never expose the raw `:3000` port publicly without
  TLS.
- Mind **call-recording/consent laws** in your jurisdiction before enabling recording.

## 5. Multi-tenant / "SaaS mode" options

Two patterns, depending on isolation needs:

- **Shared instance (simplest)**: one process, many `AgentConfig`s, each bound to its own
  Twilio number. Cheapest; all tenants share one DB.
- **Container-per-tenant (hard isolation)**: spin up one `docker compose` stack per client
  (separate DB volume, separate env) and front them with an orchestrator like **Coolify**
  or **Dokku**. This mirrors GHL's isolated "sub-account" model.

## 6. Operating costs

You pay Twilio + STT + LLM + TTS at provider rates (see
[RESEARCH.md §3](RESEARCH.md#cost)) — typically **≈ $0.04–0.10/min** depending on voice
and model choice. Use Deepgram Aura + a small LLM to minimize cost, ElevenLabs + a larger
model to maximize quality. `max_call_seconds` caps worst-case spend per call.
