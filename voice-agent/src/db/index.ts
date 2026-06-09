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

// Lightweight migration: add tenant_id columns to DBs created before SaaS mode.
function ensureColumn(table: string, col: string, decl: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  } catch {
    /* column already exists */
  }
}
for (const t of ['agents', 'calls', 'leads', 'appointments']) ensureColumn(t, 'tenant_id', 'TEXT');

const now = () => new Date().toISOString();

// ── Tenants (SaaS sub-accounts) ─────────────────────────────────────────
export interface Tenant {
  id: string;
  name: string;
  api_key: string;
  status: 'active' | 'suspended';
  plan: string;
  monthly_minute_limit: number;
  created_at: string;
}

export function createTenant(input: { name: string; plan?: string; monthly_minute_limit?: number }): Tenant {
  const id = randomUUID();
  const api_key = 'ova_' + randomUUID().replace(/-/g, '');
  const t: Tenant = {
    id,
    name: input.name,
    api_key,
    status: 'active',
    plan: input.plan ?? 'standard',
    monthly_minute_limit: input.monthly_minute_limit ?? 1000,
    created_at: now(),
  };
  db.prepare(
    `INSERT INTO tenants (id, name, api_key, status, plan, monthly_minute_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(t.id, t.name, t.api_key, t.status, t.plan, t.monthly_minute_limit, t.created_at);
  return t;
}

export function getTenant(id: string): Tenant | null {
  return (db.prepare(`SELECT * FROM tenants WHERE id=?`).get(id) as Tenant) ?? null;
}
export function getTenantByApiKey(key: string): Tenant | null {
  return (db.prepare(`SELECT * FROM tenants WHERE api_key=?`).get(key) as Tenant) ?? null;
}
export function listTenants(): Tenant[] {
  return db.prepare(`SELECT * FROM tenants ORDER BY created_at DESC`).all() as Tenant[];
}
export function updateTenant(id: string, patch: Partial<Tenant>): Tenant | null {
  const t = getTenant(id);
  if (!t) return null;
  const next = { ...t, ...patch, id };
  db.prepare(`UPDATE tenants SET name=?, status=?, plan=?, monthly_minute_limit=? WHERE id=?`).run(
    next.name,
    next.status,
    next.plan,
    next.monthly_minute_limit,
    id,
  );
  return next;
}
export function deleteTenant(id: string) {
  db.prepare(`DELETE FROM tenants WHERE id=?`).run(id);
}

/** Minutes of call time used by a tenant in a given UTC month (default: current). */
export function usageForTenant(tenantId: string, monthPrefix?: string): { minutes: number; calls: number; limit: number } {
  const prefix = monthPrefix ?? new Date().toISOString().slice(0, 7); // YYYY-MM
  const row = db
    .prepare(`SELECT COALESCE(SUM(duration_sec),0) AS secs, COUNT(*) AS n FROM calls WHERE tenant_id=? AND started_at LIKE ?`)
    .get(tenantId, prefix + '%') as any;
  const t = getTenant(tenantId);
  return { minutes: Math.round((row.secs / 60) * 10) / 10, calls: row.n, limit: t?.monthly_minute_limit ?? 0 };
}

/** True if the tenant is active and under its monthly minute limit. */
export function tenantCanCall(tenantId: string): boolean {
  const t = getTenant(tenantId);
  if (!t || t.status !== 'active') return false;
  return usageForTenant(tenantId).minutes < t.monthly_minute_limit;
}

// ── Agents ──────────────────────────────────────────────────────────────
export function createAgent(input: AgentInput, tenantId?: string): AgentConfig {
  const id = randomUUID();
  const ts = now();
  const cfg: AgentConfig = {
    ...DEFAULT_AGENT,
    ...input,
    id,
    name: input.name,
    tenant_id: tenantId,
    created_at: ts,
    updated_at: ts,
  };
  db.prepare(
    `INSERT INTO agents (id, tenant_id, name, config_json, phone_number, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, tenantId ?? null, cfg.name, JSON.stringify(cfg), (input as any).phone_number ?? null, ts, ts);
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
  const row = db.prepare(`SELECT config_json, phone_number, tenant_id FROM agents WHERE id=?`).get(id) as any;
  if (!row) return null;
  return {
    ...(JSON.parse(row.config_json) as AgentConfig),
    phone_number: row.phone_number ?? '',
    tenant_id: row.tenant_id ?? undefined,
  };
}

export function getAgentPhone(id: string): string | null {
  const row = db.prepare(`SELECT phone_number FROM agents WHERE id=?`).get(id) as any;
  return row?.phone_number ?? null;
}

export function listAgents(tenantId?: string): AgentConfig[] {
  const rows = (
    tenantId
      ? db.prepare(`SELECT config_json, phone_number, tenant_id FROM agents WHERE tenant_id=? ORDER BY created_at DESC`).all(tenantId)
      : db.prepare(`SELECT config_json, phone_number, tenant_id FROM agents ORDER BY created_at DESC`).all()
  ) as any[];
  return rows.map((r) => ({
    ...(JSON.parse(r.config_json) as AgentConfig),
    phone_number: r.phone_number ?? '',
    tenant_id: r.tenant_id ?? undefined,
  }));
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
  tenant_id?: string;
  direction: 'inbound' | 'outbound';
  from_number?: string;
  to_number?: string;
  call_sid?: string;
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO calls (id, call_sid, agent_id, tenant_id, direction, from_number, to_number, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ringing', ?)`,
  ).run(id, args.call_sid ?? null, args.agent_id, args.tenant_id ?? null, args.direction, args.from_number ?? null, args.to_number ?? null, now());
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

export function listCalls(opts: { agentId?: string; tenantId?: string } = {}): any[] {
  if (opts.tenantId)
    return db.prepare(`SELECT * FROM calls WHERE tenant_id=? ORDER BY started_at DESC LIMIT 200`).all(opts.tenantId);
  if (opts.agentId) return db.prepare(`SELECT * FROM calls WHERE agent_id=? ORDER BY started_at DESC`).all(opts.agentId);
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
  tenant_id?: string;
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
    `INSERT INTO appointments (id, agent_id, tenant_id, call_id, contact_name, contact_phone, contact_email, start_at, end_at, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    a.agent_id,
    a.tenant_id ?? null,
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

export function listAppointments(opts: { agentId?: string; tenantId?: string } = {}): any[] {
  if (opts.tenantId) return db.prepare(`SELECT * FROM appointments WHERE tenant_id=? ORDER BY start_at DESC LIMIT 200`).all(opts.tenantId);
  if (opts.agentId) return db.prepare(`SELECT * FROM appointments WHERE agent_id=? ORDER BY start_at DESC`).all(opts.agentId);
  return db.prepare(`SELECT * FROM appointments ORDER BY start_at DESC LIMIT 200`).all();
}

export function insertLead(l: {
  agent_id: string;
  tenant_id?: string;
  call_id?: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO leads (id, agent_id, tenant_id, call_id, name, phone, email, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, l.agent_id, l.tenant_id ?? null, l.call_id ?? null, l.name ?? null, l.phone ?? null, l.email ?? null, l.notes ?? null, now());
  return id;
}

export function listLeads(opts: { agentId?: string; tenantId?: string } = {}): any[] {
  if (opts.tenantId) return db.prepare(`SELECT * FROM leads WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200`).all(opts.tenantId);
  if (opts.agentId) return db.prepare(`SELECT * FROM leads WHERE agent_id=? ORDER BY created_at DESC`).all(opts.agentId);
  return db.prepare(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 200`).all();
}
