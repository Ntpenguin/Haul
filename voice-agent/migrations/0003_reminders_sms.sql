-- Appointment reminder tracking + SMS conversation threads.
ALTER TABLE appointments ADD COLUMN reminder_24_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN reminder_1_at  TIMESTAMPTZ;

-- Two-way SMS threads (the AI brain over text).
CREATE TABLE sms_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  call_id       UUID REFERENCES calls(id) ON DELETE SET NULL,
  contact_number TEXT NOT NULL,
  history       JSONB NOT NULL DEFAULT '[]',   -- ChatMessage[] (no system message)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, contact_number)
);
CREATE INDEX idx_sms_threads_tenant ON sms_threads(tenant_id);
