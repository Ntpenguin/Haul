-- OpenVoice Agent schema (SQLite)

CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  config_json   TEXT NOT NULL,          -- full AgentConfig serialized
  phone_number  TEXT,                   -- Twilio number routed to this agent (E.164), nullable
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calls (
  id            TEXT PRIMARY KEY,       -- our call id
  call_sid      TEXT,                   -- Twilio CallSid
  agent_id      TEXT NOT NULL,
  direction     TEXT NOT NULL,          -- inbound | outbound
  from_number   TEXT,
  to_number     TEXT,
  status        TEXT NOT NULL,          -- ringing | in-progress | completed | failed | transferred
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  duration_sec  INTEGER DEFAULT 0,
  recording_url TEXT,
  outcome       TEXT,                   -- booked | captured | transferred | no-action
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- One row per utterance (caller or agent) — the transcript.
CREATE TABLE IF NOT EXISTS transcript_turns (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id   TEXT NOT NULL,
  role      TEXT NOT NULL,             -- user | assistant | tool
  content   TEXT NOT NULL,
  meta_json TEXT,                      -- tool name/args/result when role=tool
  ts        TEXT NOT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

-- Appointments booked by the book_appointment tool.
CREATE TABLE IF NOT EXISTS appointments (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  call_id     TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  start_at    TEXT NOT NULL,           -- ISO 8601
  end_at      TEXT NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL
);

-- Leads captured by the capture_lead tool.
CREATE TABLE IF NOT EXISTS leads (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  call_id     TEXT,
  name        TEXT,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_turns_call ON transcript_turns(call_id);
CREATE INDEX IF NOT EXISTS idx_appt_agent ON appointments(agent_id);
