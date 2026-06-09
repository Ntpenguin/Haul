/**
 * Schema embedded as a string so it ships with the compiled output (tsc does not
 * copy .sql files). The canonical, human-readable copy lives in schema.sql.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  config_json   TEXT NOT NULL,
  phone_number  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calls (
  id            TEXT PRIMARY KEY,
  call_sid      TEXT,
  agent_id      TEXT NOT NULL,
  direction     TEXT NOT NULL,
  from_number   TEXT,
  to_number     TEXT,
  status        TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  duration_sec  INTEGER DEFAULT 0,
  recording_url TEXT,
  outcome       TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS transcript_turns (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id   TEXT NOT NULL,
  role      TEXT NOT NULL,
  content   TEXT NOT NULL,
  meta_json TEXT,
  ts        TEXT NOT NULL,
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  call_id     TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  start_at    TEXT NOT NULL,
  end_at      TEXT NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL
);

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
`;
