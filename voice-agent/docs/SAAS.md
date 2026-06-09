# SaaS mode (multi-tenant / reseller)

The "sub-account" model that makes this resellable. You (the **platform admin**) onboard
**tenants** (client businesses); each tenant signs up, configures its own agents, and sees
only its own data, usage, and billing.

## Roles & auth

`/api/*` accepts a bearer token that is one of:

| Principal | Token | Can do |
|---|---|---|
| **Platform admin** | `ADMIN_TOKEN` | Everything + manage tenants + cross-tenant usage |
| **Tenant (login)** | a **JWT** from `/api/auth/login` or `/signup` | CRUD only its own agents/data |
| **Tenant (programmatic)** | the tenant's **`api_key`** | same scope, for scripts/integrations |

Dev convenience: with **no** `ADMIN_TOKEN` and **zero tenants**, the API runs open as
admin. Setting `ADMIN_TOKEN` or creating a tenant enforces auth.

## Onboarding paths

**Self-serve (recommended):** a tenant signs up in the dashboard →
`POST /api/auth/signup {name,email,password}` (bcrypt, returns a JWT). They land on a low
**trial** minute limit; clicking **Upgrade / Billing** starts Stripe Checkout. The
subscription webhook flips them to a paid plan/limit.

**Admin-provisioned:** you create the tenant via `POST /api/tenants` (admin) and hand them
their `api_key` (shown once in the dashboard Tenants tab). Bill via Stripe metered or
manually.

```bash
ADMIN=...; H="Authorization: Bearer $ADMIN"
curl -X POST localhost:3000/api/tenants -H "$H" -H 'Content-Type: application/json' \
  -d '{"name":"Client A","plan":"pro","monthly_minute_limit":2000}'   # → {api_key,...}
curl localhost:3000/api/usage -H "$H"                                   # usage per tenant
curl -X PUT localhost:3000/api/tenants/<id> -H "$H" -d '{"status":"suspended"}'
```

## Billing & metering

- Stripe **Checkout subscription** (base plan) + optional **metered per-minute** price.
- The webhook (`/webhooks/stripe`) keeps `tenant.status` in sync:
  `checkout.session.completed` → active, `invoice.payment_failed` → past_due,
  `customer.subscription.deleted` → canceled.
- Every call records `duration_sec` against its tenant. `/api/usage` sums monthly minutes;
  `reportUsageToStripe()` pushes them to the metered price on an interval.
- **Call gating:** suspended / over-limit tenants can't place outbound (`402`) and inbound
  calls are politely declined — protecting you from unpaid usage.

## Two isolation models

- **Shared instance (default, cheapest):** one app + one Postgres; tenants are rows. All of
  the above works out of the box. Back up the database.
- **Container-per-tenant (hard isolation, closest to GHL sub-accounts):** one stack +
  volume per tenant, orchestrated by **Coolify** or **Dokku**. On signup your control
  script brings up a fresh `docker compose -p tenant_<id>` with its own `DATABASE_URL`,
  subdomain, and Twilio number(s). Pros: blast-radius isolation, per-tenant
  backups/upgrades. Cons: you operate N stacks. Hybrid (shared for small plans, dedicated
  for enterprise) is common.

## White-labeling

The dashboard is static (`public/`) — rebrand colors/logo in `styles.css`/`index.html`.
Give each client a per-tenant subdomain; they log in with their own email/password
(or you issue an `api_key`) for a branded portal.

## Production security

- Strong `ADMIN_TOKEN` + `JWT_SECRET`; never ship dev open-mode.
- Treat `api_key`s/JWTs as secrets; rotate by re-issuing.
- Keep Twilio + Stripe signature verification on.
- Per-tenant rate limits if you expose the API publicly (a global limiter is already on).
