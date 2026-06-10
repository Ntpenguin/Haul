-- After-hours voicemails captured by the inbound flow.
CREATE TABLE voicemails (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  call_id       UUID REFERENCES calls(id) ON DELETE SET NULL,
  from_number   TEXT,
  recording_url TEXT,
  transcript    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_voicemails_tenant ON voicemails(tenant_id);
