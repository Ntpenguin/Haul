# Self-hosting

## Prerequisites

- A server reachable over **public HTTPS** (Twilio POSTs to it + opens a WSS stream;
  Stripe + Google also call back). A small VPS is plenty — this is I/O-bound.
- **Postgres** (the bundled compose includes it, or use managed Postgres).
- A **Twilio** account + a voice-capable number.
- API keys for your chosen **STT / LLM / TTS** providers.
- Optional: **Stripe** (billing) and **Google Cloud OAuth** (calendar).

## Option A — Docker Compose (app + Postgres + Caddy, auto-HTTPS)

```bash
cp .env.example .env
#   set: DOMAIN=voice.example.com   PUBLIC_BASE_URL=https://voice.example.com
#        ADMIN_TOKEN=<random>       JWT_SECRET=<random>   POSTGRES_PASSWORD=<random>
#        provider keys (DEEPGRAM/OPENAI/ELEVENLABS), TWILIO_*, optional STRIPE_*/GOOGLE_*
docker compose up -d --build
```

- Point your domain's A record at the host. Caddy obtains a Let's Encrypt cert
  automatically and proxies WebSocket upgrades, so Twilio Media Streams just works.
- Migrations run automatically on boot. The DB persists in the `pgdata` volume.
- Create your first agent in the dashboard (sign up, or log in with `ADMIN_TOKEN`).

## Option B — Fly.io

```bash
fly launch --no-deploy
fly postgres create && fly postgres attach <pg-app>     # sets DATABASE_URL
fly secrets set ADMIN_TOKEN=... JWT_SECRET=... PUBLIC_BASE_URL=https://<app>.fly.dev \
  DEEPGRAM_API_KEY=... OPENAI_API_KEY=... ELEVENLABS_API_KEY=... \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=...
fly deploy
```

Render/Railway work the same way: deploy the Dockerfile, add a managed Postgres, set the
env vars. Keep at least one instance always-on so calls connect instantly.

## Wire up Twilio

1. Console → your number → **Voice → A call comes in**: `https://YOUR_DOMAIN/twilio/inbound`
   (HTTP **POST**). Optional status callback: `/twilio/status`.
2. Signature verification is **on by default** (`TWILIO_VALIDATE_SIGNATURE=true`) and uses
   `TWILIO_AUTH_TOKEN` + `PUBLIC_BASE_URL` — make sure `PUBLIC_BASE_URL` exactly matches
   the URL Twilio calls.
3. Set the agent's **Routed phone number** in the dashboard. One agent → all inbound
   routes to it; several → each is matched by its number (multi-business).

## Stripe (billing)

1. Create a **Product** with a recurring **price** (base plan) → `STRIPE_PRICE_SUBSCRIPTION`.
   Optionally a **metered** usage price (per minute) → `STRIPE_PRICE_METERED`.
2. Set `STRIPE_SECRET_KEY`. Add a webhook endpoint `https://YOUR_DOMAIN/webhooks/stripe`
   for `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`;
   put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Tenants hit **Upgrade / Billing** in the dashboard → Stripe Checkout. Status syncs back
   via the webhook; minutes are reported to the metered price on an interval.

## Google Calendar (optional)

1. Google Cloud Console → OAuth consent screen + **OAuth client (Web)**. Authorized
   redirect URI: `https://YOUR_DOMAIN/calendar/google/callback`.
2. Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
3. Each tenant clicks **Connect Google Calendar** in the dashboard. Until connected,
   bookings use the built-in calendar.

## Security checklist

- Strong random `ADMIN_TOKEN` + `JWT_SECRET` (the app refuses to boot in production
  without them, and without `PUBLIC_BASE_URL`).
- Keep `TWILIO_VALIDATE_SIGNATURE=true`; keep the Stripe webhook secret set.
- Always terminate TLS (Caddy/Fly/Render do). Never expose raw `:3000` publicly.
- Treat tenant `api_key`s and JWTs as secrets. Set `CORS_ORIGIN` to your dashboard origin.
- Mind call-recording/consent laws before enabling recording.

## Operating cost

You pay Twilio + STT + LLM + TTS at provider rates (~**$0.04–0.10/min**, see
[RESEARCH.md §3](RESEARCH.md#cost)). `max_call_seconds` caps per-call spend; tenant
`monthly_minute_limit` caps per-tenant spend.
