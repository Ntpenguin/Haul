import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';
import { AgentConfig, AgentInput, DEFAULT_AGENT } from '../agent/types.js';

mkdirSync(dirname(resolve(config.dbPath)), { recursive: true });
export const db = new Database(resolve(config.dbPath));
db.pragma('journal_mode = WAL');
db.exec(SCHEMA_SQL);

const now = () => new Date().toISOString();

// ── Agents ──────────────────────────────────────────────────────────────
export function createAgent(input: AgentInput): AgentConfig {
  const id = randomUUID();
  const ts = now();
  const cfg: AgentConfig = {
    ...DEFAULT_AGENT,
    ...input,
    id,
    name: input.name,
    created_at: ts,
    updated_at: ts,
  };
  db.prepare(
    `INSERT INTO agents (id, name, config_json, phone_number, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, cfg.name, JSON.stringify(cfg), (input as any).phone_number ?? null, ts, ts);
  return cfg;
}

export function updateAgent(id: string, patch: Partial<AgentConfig> & { phone_number?: string }): AgentConfig | null {
  const existing = getAgent(id);
  if (!existing) return null;
  const cfg: AgentConfig = { ...existing, ...patch, id, updated_at: now() };
  db.prepare(`UPDATE agents SET name=?, config_json=?, phone_number=?, updated_at=? WHERE id=?`).run(
    cfg.name,
    JSON.stringify(cfg),
    (patch as any).phone_number ?? getAgentPhone(id),
    cfg.updated_at,
    id,
  );
  return cfg;
}

export function getAgent(id: string): AgentConfig | null {
  const row = db.prepare(`SELECT config_json, phone_number FROM agents WHERE id=?`).get(id) as any;
  if (!row) return null;
  return { ...(JSON.parse(row.config_json) as AgentConfig), phone_number: row.phone_number ?? '' } as AgentConfig & { phone_number: string };
}

export function getAgentPhone(id: string): string | null {
  const row = db.prepare(`SELECT phone_number FROM agents WHERE id=?`).get(id) as any;
  return row?.phone_number ?? null;
}

export function listAgents(): AgentConfig[] {
  const rows = db.prepare(`SELECT config_json, phone_number FROM agents ORDER BY created_at DESC`).all() as any[];
  return rows.map((r) => ({ ...(JSON.parse(r.config_json) as AgentConfig), phone_number: r.phone_number ?? '' }));
}

export function deleteAgent(id: string) {
  db.prepare(`DELETE FROM agents WHERE id=?`).run(id);
}

/** Find the agent that owns a given Twilio number (for inbound routing). */
export function agentForNumber(toNumber: string): AgentConfig | null {
  const row = db.prepare(`SELECT config_json FROM agents WHERE phone_number=?`).get(toNumber) as any;
  if (row) return JSON.parse(row.config_json) as AgentConfig;
  // Fallback: if exactly one agent exists, use it (single-tenant convenience).
  const all = listAgents();
  return all.length === 1 ? all[0] : null;
}

// ── Calls ───────────────────────────────────────────────────────────────
export function createCall(args: {
  agent_id: string;
  direction: 'inbound' | 'outbound';
  from_number?: string;
  to_number?: string;
  call_sid?: string;
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO calls (id, call_sid, agent_id, direction, from_number, to_number, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, 'ringing', ?)`,
  ).run(id, args.call_sid ?? null, args.agent_id, args.direction, args.from_number ?? null, args.to_number ?? null, now());
  return id;
}

export function attachCallSid(callId: string, callSid: string) {
  db.prepare(`UPDATE calls SET call_sid=?, status='in-progress' WHERE id=?`).run(callSid, callId);
}

export function callBySid(callSid: string): any {
  return db.prepare(`SELECT * FROM calls WHERE call_sid=?`).get(callSid);
}

export function finishCall(callId: string, status: string, outcome?: string) {
  const row = db.prepare(`SELECT started_at FROM calls WHERE id=?`).get(callId) as any;
  const dur = row ? Math.round((Date.now() - new Date(row.started_at).getTime()) / 1000) : 0;
  db.prepare(`UPDATE calls SET status=?, ended_at=?, duration_sec=?, outcome=COALESCE(?, outcome) WHERE id=?`).run(
    status,
    now(),
    dur,
    outcome ?? null,
    callId,
  );
}

export function setOutcome(callId: string, outcome: string) {
  db.prepare(`UPDATE calls SET outcome=? WHERE id=?`).run(outcome, callId);
}

export function listCalls(agentId?: string): any[] {
  if (agentId) return db.prepare(`SELECT * FROM calls WHERE agent_id=? ORDER BY started_at DESC`).all(agentId);
  return db.prepare(`SELECT * FROM calls ORDER BY started_at DESC LIMIT 200`).all();
}

export function addTurn(callId: string, role: string, content: string, meta?: unknown) {
  db.prepare(`INSERT INTO transcript_turns (call_id, role, content, meta_json, ts) VALUES (?, ?, ?, ?, ?)`).run(
    callId,
    role,
    content,
    meta ? JSON.stringify(meta) : null,
    now(),
  );
}

export function getTranscript(callId: string): any[] {
  return db.prepare(`SELECT role, content, meta_json, ts FROM transcript_turns WHERE call_id=? ORDER BY id`).all(callId);
}

// ── Appointments & leads ────────────────────────────────────────────────
export function insertAppointment(a: {
  agent_id: string;
  call_id?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  start_at: string;
  end_at: string;
  notes?: string;
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO appointments (id, agent_id, call_id, contact_name, contact_phone, contact_email, start_at, end_at, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    a.agent_id,
    a.call_id ?? null,
    a.contact_name ?? null,
    a.contact_phone ?? null,
    a.contact_email ?? null,
    a.start_at,
    a.end_at,
    a.notes ?? null,
    now(),
  );
  return id;
}

export function appointmentsBetween(agentId: string, startIso: string, endIso: string): any[] {
  return db
    .prepare(`SELECT * FROM appointments WHERE agent_id=? AND start_at < ? AND end_at > ? ORDER BY start_at`)
    .all(agentId, endIso, startIso);
}

export function listAppointments(agentId?: string): any[] {
  if (agentId) return db.prepare(`SELECT * FROM appointments WHERE agent_id=? ORDER BY start_at DESC`).all(agentId);
  return db.prepare(`SELECT * FROM appointments ORDER BY start_at DESC LIMIT 200`).all();
}

export function insertLead(l: {
  agent_id: string;
  call_id?: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO leads (id, agent_id, call_id, name, phone, email, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, l.agent_id, l.call_id ?? null, l.name ?? null, l.phone ?? null, l.email ?? null, l.notes ?? null, now());
  return id;
}

export function listLeads(agentId?: string): any[] {
  if (agentId) return db.prepare(`SELECT * FROM leads WHERE agent_id=? ORDER BY created_at DESC`).all(agentId);
  return db.prepare(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 200`).all();
}
