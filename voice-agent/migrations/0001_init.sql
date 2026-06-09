-- OpenVoice Agent — initial Postgres schema (multi-tenant SaaS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- Tenants = reseller sub-accounts (one per client business). Login + billing live here.
CREATE TABLE tenants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  email                  TEXT UNIQUE,
  password_hash          TEXT,
  api_key                TEXT NOT NULL UNIQUE,
  status                 TEXT NOT NULL DEFAULT 'active',  -- active | suspended | past_due | canceled
  plan                   TEXT NOT NULL DEFAULT 'starter',
  monthly_minute_limit   INTEGER NOT NULL DEFAULT 500,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  config        JSONB NOT NULL,
  phone_number  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agents_tenant ON agents(tenant_id);
CREATE UNIQUE INDEX idx_agents_phone ON agents(phone_number) WHERE phone_number IS NOT NULL;

CREATE TABLE calls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid      TEXT,
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  direction     TEXT NOT NULL,                 -- inbound | outbound
  from_number   TEXT,
  to_number     TEXT,
  status        TEXT NOT NULL,                 -- ringing | in-progress | completed | failed | transferred
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  duration_sec  INTEGER NOT NULL DEFAULT 0,
  recording_url TEXT,
  outcome       TEXT,                          -- booked | captured | transferred | no-action
  billed        BOOLEAN NOT NULL DEFAULT false -- reported to Stripe metering
);
CREATE INDEX idx_calls_agent ON calls(agent_id);
CREATE INDEX idx_calls_tenant_started ON calls(tenant_id, started_at);

CREATE TABLE transcript_turns (
  id        BIGSERIAL PRIMARY KEY,
  call_id   UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  role      TEXT NOT NULL,                     -- user | assistant | tool
  content   TEXT NOT NULL,
  meta      JSONB,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_turns_call ON transcript_turns(call_id);

CREATE TABLE appointments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  call_id       UUID REFERENCES calls(id) ON DELETE SET NULL,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NOT NULL,
  notes         TEXT,
  external_id   TEXT,                          -- Google/Cal.com event id when synced
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_appt_agent_time ON appointments(agent_id, start_at);

CREATE TABLE leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  call_id     UUID REFERENCES calls(id) ON DELETE SET NULL,
  name        TEXT,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_tenant ON leads(tenant_id);

-- Per-tenant calendar integration credentials (Google OAuth tokens, etc.).
CREATE TABLE calendar_connections (
  tenant_id     UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,                 -- google
  access_token  TEXT,
  refresh_token TEXT,
  calendar_id   TEXT NOT NULL DEFAULT 'primary',
  expiry        TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
