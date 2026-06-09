# SaaS mode (multi-tenant / reseller)

This is the "sub-account" model — the thing that makes GoHighLevel resellable. You (the
**platform admin**) onboard **tenants** (your client businesses); each tenant manages its
own agents and sees only its own calls, leads, appointments, and usage.

## Roles & auth

`/api/*` accepts a bearer token that is **either**:

| Principal | Token | Can do |
|---|---|---|
| **Platform admin** | `ADMIN_TOKEN` (env) | Everything + manage tenants + see all data + usage across tenants |
| **Tenant** | the tenant's `api_key` | CRUD only its own agents; see only its own calls/leads/appointments/usage |

Dev convenience: with **no** `ADMIN_TOKEN` set **and zero tenants**, the API runs open as
admin. The moment you set `ADMIN_TOKEN` or create a tenant, auth is enforced.

## Lifecycle

```bash
ADMIN=...your ADMIN_TOKEN...

# 1) Onboard a client (returns an api_key — give it to that client)
curl -X POST localhost:3000/api/tenants -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Client A","plan":"pro","monthly_minute_limit":2000}'
#  → { "id": "...", "api_key": "ova_...", "monthly_minute_limit": 2000, ... }

# 2) The client uses ITS key for everything (scoped automatically)
curl -X POST localhost:3000/api/agents -H "Authorization: Bearer ova_..." \
  -H 'Content-Type: application/json' -d '{"name":"Reception","phone_number":"+1512..."}'

# 3) Metering / billing
curl localhost:3000/api/usage -H "Authorization: Bearer ova_..."
#  → { "minutes": 134.2, "calls": 88, "limit": 2000, "month": "2026-06" }

# 4) Suspend / change plan (admin)
curl -X PUT localhost:3000/api/tenants/<id> -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"status":"suspended"}'
```

## Usage metering & billing hook

- Every call records `duration_sec` against its `tenant_id`. `/api/usage` sums minutes for
  the current (or `?month=YYYY-MM`) UTC month.
- **Outbound calls are gated**: a suspended tenant, or one over `monthly_minute_limit`,
  gets `402 Payment Required`. (Inbound gating can be added the same way in
  `twiml.ts` before returning the `<Stream>`.)
- To bill, run a monthly job that reads `/api/usage` per tenant and pushes minutes to
  **Stripe metered billing** (or your invoicing system). The data model is ready; wiring
  the Stripe meter is the only remaining piece for automated invoicing.

## Two isolation models

Pick based on how much you need tenants separated:

### A. Shared instance (default, cheapest)
One process + one SQLite DB; tenants are rows. Everything above works out of the box.
Great to start; scales to many small tenants. All data lives in one DB file — back it up.

### B. Container-per-tenant (hard isolation — closest to GHL sub-accounts)
One container + volume per tenant, fronted by an orchestrator:

- Use **Coolify** or **Dokku** on a VPS.
- On signup, your control script:
  1. `docker compose -p tenant_<id>` up a fresh stack with its own `DB_PATH` volume and
     env (its own `ADMIN_TOKEN`, provider keys, and `PUBLIC_BASE_URL`/subdomain);
  2. points a subdomain (e.g. `clienta.yourvoiceplatform.com`) at it;
  3. configures the tenant's Twilio number(s) → that container's `/twilio/inbound`.
- Pros: blast-radius isolation, per-tenant backups/upgrades, noisy-neighbor safety.
- Cons: more moving parts; you operate N stacks.

A common hybrid: shared instance for small plans, dedicated containers for enterprise.

## White-labeling

- The dashboard is static (`public/`) — rebrand colors/logo in `styles.css` / `index.html`.
- Per-tenant subdomains + a tenant-scoped login (issue each client their `api_key`, or put
  a thin login in front that exchanges email/password for the key) give the
  "their-own-branded-portal" feel GHL sells.

## Security checklist for production

- Set a strong `ADMIN_TOKEN`; never ship the dev open-mode to production.
- Treat `api_key`s as secrets; rotate by issuing a new tenant or adding a key-rotation
  endpoint.
- Validate `X-Twilio-Signature` on `/twilio/*` (left as a hook) so only Twilio can start calls.
- Per-tenant rate limits if you expose the API publicly.
