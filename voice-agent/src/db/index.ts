import { randomUUID } from 'node:crypto';
import { query, one } from './pool.js';
import { AgentConfig, AgentInput, DEFAULT_AGENT } from '../agent/types.js';

// ── Tenants (SaaS sub-accounts) ─────────────────────────────────────────
export interface Tenant {
  id: string;
  name: string;
  email: string | null;
  password_hash: string | null;
  api_key: string;
  status: 'active' | 'suspended' | 'past_due' | 'canceled';
  plan: string;
  monthly_minute_limit: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

export function newApiKey(): string {
  return 'ova_' + randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 8);
}

export async function createTenant(input: {
  name: string;
  email?: string;
  password_hash?: string;
  plan?: string;
  monthly_minute_limit?: number;
}): Promise<Tenant> {
  return (await one<Tenant>(
    `INSERT INTO tenants (name, email, password_hash, api_key, plan, monthly_minute_limit)
     VALUES ($1, $2, $3, $4, COALESCE($5,'starter'), COALESCE($6,500)) RETURNING *`,
    [input.name, input.email ?? null, input.password_hash ?? null, newApiKey(), input.plan ?? null, input.monthly_minute_limit ?? null],
  ))!;
}

export const getTenant = (id: string) => one<Tenant>(`SELECT * FROM tenants WHERE id=$1`, [id]);
export const getTenantByApiKey = (key: string) => one<Tenant>(`SELECT * FROM tenants WHERE api_key=$1`, [key]);
export const getTenantByEmail = (email: string) => one<Tenant>(`SELECT * FROM tenants WHERE lower(email)=lower($1)`, [email]);
export const getTenantByStripeCustomer = (cid: string) => one<Tenant>(`SELECT * FROM tenants WHERE stripe_customer_id=$1`, [cid]);
export const listTenants = () => query<Tenant>(`SELECT * FROM tenants ORDER BY created_at DESC`);

export async function updateTenant(id: string, patch: Partial<Tenant>): Promise<Tenant | null> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  const allowed: (keyof Tenant)[] = [
    'name', 'email', 'password_hash', 'status', 'plan', 'monthly_minute_limit',
    'stripe_customer_id', 'stripe_subscription_id',
  ];
  for (const k of allowed) {
    if (k in patch && patch[k] !== undefined) {
      cols.push(`${k}=$${cols.length + 2}`);
      vals.push(patch[k]);
    }
  }
  if (!cols.length) return getTenant(id);
  return one<Tenant>(`UPDATE tenants SET ${cols.join(', ')} WHERE id=$1 RETURNING *`, [id, ...vals]);
}

export const deleteTenant = (id: string) => query(`DELETE FROM tenants WHERE id=$1`, [id]);

export async function usageForTenant(
  tenantId: string,
  monthPrefix?: string,
): Promise<{ minutes: number; calls: number; limit: number; month: string }> {
  const month = monthPrefix ?? new Date().toISOString().slice(0, 7);
  const row = await one<{ secs: number; n: number }>(
    `SELECT COALESCE(SUM(duration_sec),0)::int AS secs, COUNT(*)::int AS n
       FROM calls WHERE tenant_id=$1 AND to_char(started_at,'YYYY-MM')=$2`,
    [tenantId, month],
  );
  const t = await getTenant(tenantId);
  return { minutes: Math.round(((row?.secs ?? 0) / 60) * 10) / 10, calls: row?.n ?? 0, limit: t?.monthly_minute_limit ?? 0, month };
}

export async function tenantCanCall(tenantId: string): Promise<boolean> {
  const t = await getTenant(tenantId);
  if (!t || t.status !== 'active') return false;
  const u = await usageForTenant(tenantId);
  return u.minutes < t.monthly_minute_limit;
}

// ── Agents ──────────────────────────────────────────────────────────────
function rowToAgent(row: any): AgentConfig {
  return {
    ...(row.config as AgentConfig),
    id: row.id,
    tenant_id: row.tenant_id ?? undefined,
    phone_number: row.phone_number ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createAgent(input: AgentInput, tenantId?: string): Promise<AgentConfig> {
  const id = randomUUID();
  const cfg: AgentConfig = { ...DEFAULT_AGENT, ...input, id, name: input.name, tenant_id: tenantId, created_at: '', updated_at: '' };
  const phone = (input as any).phone_number || null;
  const row = await one(
    `INSERT INTO agents (id, tenant_id, name, config, phone_number)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, tenantId ?? null, cfg.name, JSON.stringify(cfg), phone],
  );
  return rowToAgent(row);
}

export async function updateAgent(id: string, patch: Partial<AgentConfig>): Promise<AgentConfig | null> {
  const existing = await getAgent(id);
  if (!existing) return null;
  const cfg: AgentConfig = { ...existing, ...patch, id };
  const phone = patch.phone_number !== undefined ? patch.phone_number : existing.phone_number;
  const row = await one(
    `UPDATE agents SET name=$2, config=$3, phone_number=$4, updated_at=now() WHERE id=$1 RETURNING *`,
    [id, cfg.name, JSON.stringify(cfg), phone || null],
  );
  return row ? rowToAgent(row) : null;
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  const row = await one(`SELECT * FROM agents WHERE id=$1`, [id]);
  return row ? rowToAgent(row) : null;
}

export async function listAgents(tenantId?: string): Promise<AgentConfig[]> {
  const rows = tenantId
    ? await query(`SELECT * FROM agents WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId])
    : await query(`SELECT * FROM agents ORDER BY created_at DESC`);
  return rows.map(rowToAgent);
}

export const deleteAgent = (id: string) => query(`DELETE FROM agents WHERE id=$1`, [id]);

export async function agentForNumber(toNumber: string): Promise<AgentConfig | null> {
  const row = await one(`SELECT * FROM agents WHERE phone_number=$1`, [toNumber]);
  if (row) return rowToAgent(row);
  const all = await listAgents();
  return all.length === 1 ? all[0] : null; // single-tenant convenience
}

// ── Calls ───────────────────────────────────────────────────────────────
export async function createCall(args: {
  agent_id: string;
  tenant_id?: string;
  direction: 'inbound' | 'outbound' | 'sms';
  from_number?: string;
  to_number?: string;
  call_sid?: string;
}): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO calls (call_sid, agent_id, tenant_id, direction, from_number, to_number, status)
     VALUES ($1,$2,$3,$4,$5,$6,'ringing') RETURNING id`,
    [args.call_sid ?? null, args.agent_id, args.tenant_id ?? null, args.direction, args.from_number ?? null, args.to_number ?? null],
  );
  return row!.id;
}

export const attachCallSid = (callId: string, callSid: string) =>
  query(`UPDATE calls SET call_sid=$2, status='in-progress' WHERE id=$1`, [callId, callSid]);

export const callBySid = (callSid: string) => one(`SELECT * FROM calls WHERE call_sid=$1`, [callSid]);
export const getCall = (id: string) => one(`SELECT * FROM calls WHERE id=$1`, [id]);
export const setRecording = (callSid: string, url: string) =>
  query(`UPDATE calls SET recording_url=$2 WHERE call_sid=$1`, [callSid, url]);

export const finishCall = (callId: string, status: string, outcome?: string) =>
  query(
    `UPDATE calls SET status=$2, ended_at=now(),
       duration_sec=GREATEST(0, EXTRACT(EPOCH FROM now()-started_at)::int),
       outcome=COALESCE($3, outcome)
     WHERE id=$1 AND ended_at IS NULL`,
    [callId, status, outcome ?? null],
  );

export const setOutcome = (callId: string, outcome: string) =>
  query(`UPDATE calls SET outcome=$2 WHERE id=$1`, [callId, outcome]);

export function listCalls(opts: { agentId?: string; tenantId?: string } = {}) {
  if (opts.tenantId) return query(`SELECT * FROM calls WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 200`, [opts.tenantId]);
  if (opts.agentId) return query(`SELECT * FROM calls WHERE agent_id=$1 ORDER BY started_at DESC LIMIT 200`, [opts.agentId]);
  return query(`SELECT * FROM calls ORDER BY started_at DESC LIMIT 200`);
}

export const addTurn = (callId: string, role: string, content: string, meta?: unknown) =>
  query(`INSERT INTO transcript_turns (call_id, role, content, meta) VALUES ($1,$2,$3,$4)`, [
    callId,
    role,
    content,
    meta ? JSON.stringify(meta) : null,
  ]);

export const getTranscript = (callId: string) =>
  query(`SELECT role, content, meta, ts FROM transcript_turns WHERE call_id=$1 ORDER BY id`, [callId]);

/** Completed, not-yet-billed calls for a tenant (for Stripe metering). */
export const unbilledCalls = (tenantId: string) =>
  query(`SELECT id, duration_sec FROM calls WHERE tenant_id=$1 AND billed=false AND ended_at IS NOT NULL`, [tenantId]);

export const markBilled = (callIds: string[]) =>
  callIds.length ? query(`UPDATE calls SET billed=true WHERE id = ANY($1::uuid[])`, [callIds]) : Promise.resolve([]);

/** Aggregate call stats for a tenant (or platform-wide when tenantId is undefined). */
export async function analyticsFor(tenantId?: string): Promise<{
  totals: { calls: number; completed: number; minutes: number; booked: number; captured: number; transferred: number; booked_rate: number; avg_sec: number };
  by_day: { day: string; calls: number; booked: number }[];
}> {
  const t = tenantId ?? null;
  const totals = (await one<any>(
    `SELECT
       COUNT(*)::int AS calls,
       COUNT(*) FILTER (WHERE status IN ('completed','transferred'))::int AS completed,
       COALESCE(SUM(duration_sec),0)::int AS total_sec,
       COUNT(*) FILTER (WHERE outcome='booked')::int AS booked,
       COUNT(*) FILTER (WHERE outcome='captured')::int AS captured,
       COUNT(*) FILTER (WHERE outcome='transferred')::int AS transferred
     FROM calls WHERE ($1::uuid IS NULL OR tenant_id=$1)`,
    [t],
  ))!;
  const by_day = await query<{ day: string; calls: number; booked: number }>(
    `SELECT to_char(started_at,'YYYY-MM-DD') AS day, COUNT(*)::int AS calls,
            COUNT(*) FILTER (WHERE outcome='booked')::int AS booked
     FROM calls
     WHERE started_at > now() - interval '14 days' AND ($1::uuid IS NULL OR tenant_id=$1)
     GROUP BY 1 ORDER BY 1`,
    [t],
  );
  const calls = totals.calls || 0;
  return {
    totals: {
      calls,
      completed: totals.completed || 0,
      minutes: Math.round((totals.total_sec / 60) * 10) / 10,
      booked: totals.booked || 0,
      captured: totals.captured || 0,
      transferred: totals.transferred || 0,
      booked_rate: calls ? Math.round((totals.booked / calls) * 100) : 0,
      avg_sec: calls ? Math.round(totals.total_sec / calls) : 0,
    },
    by_day,
  };
}

// ── Appointments & leads ────────────────────────────────────────────────
export async function insertAppointment(a: {
  agent_id: string;
  tenant_id?: string;
  call_id?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  start_at: string;
  end_at: string;
  notes?: string;
  external_id?: string;
}): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO appointments (agent_id, tenant_id, call_id, contact_name, contact_phone, contact_email, start_at, end_at, notes, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [a.agent_id, a.tenant_id ?? null, a.call_id ?? null, a.contact_name ?? null, a.contact_phone ?? null, a.contact_email ?? null, a.start_at, a.end_at, a.notes ?? null, a.external_id ?? null],
  );
  return row!.id;
}

export const appointmentsBetween = (agentId: string, startIso: string, endIso: string) =>
  query(`SELECT * FROM appointments WHERE agent_id=$1 AND start_at < $3 AND end_at > $2 ORDER BY start_at`, [agentId, startIso, endIso]);

export function listAppointments(opts: { agentId?: string; tenantId?: string } = {}) {
  if (opts.tenantId) return query(`SELECT * FROM appointments WHERE tenant_id=$1 ORDER BY start_at DESC LIMIT 200`, [opts.tenantId]);
  if (opts.agentId) return query(`SELECT * FROM appointments WHERE agent_id=$1 ORDER BY start_at DESC LIMIT 200`, [opts.agentId]);
  return query(`SELECT * FROM appointments ORDER BY start_at DESC LIMIT 200`);
}

export async function insertLead(l: {
  agent_id: string;
  tenant_id?: string;
  call_id?: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO leads (agent_id, tenant_id, call_id, name, phone, email, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [l.agent_id, l.tenant_id ?? null, l.call_id ?? null, l.name ?? null, l.phone ?? null, l.email ?? null, l.notes ?? null],
  );
  return row!.id;
}

export function listLeads(opts: { agentId?: string; tenantId?: string } = {}) {
  if (opts.tenantId) return query(`SELECT * FROM leads WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`, [opts.tenantId]);
  if (opts.agentId) return query(`SELECT * FROM leads WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 200`, [opts.agentId]);
  return query(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 200`);
}

// ── Calendar connections (per-tenant OAuth) ─────────────────────────────
export interface CalendarConnection {
  tenant_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  calendar_id: string;
  expiry: string | null;
}

/** Most recent prior lead for a phone number (returning-caller recognition). */
export function recentContactByPhone(opts: { tenantId?: string; agentId?: string }, phone: string) {
  if (opts.tenantId)
    return one<any>(`SELECT * FROM leads WHERE tenant_id=$1 AND phone=$2 ORDER BY created_at DESC LIMIT 1`, [opts.tenantId, phone]);
  return one<any>(`SELECT * FROM leads WHERE agent_id=$1 AND phone=$2 ORDER BY created_at DESC LIMIT 1`, [opts.agentId, phone]);
}

// ── Appointment reminders ───────────────────────────────────────────────
export interface DueReminder {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  start_at: string;
  kind: '24h' | '1h';
}
/** Appointments whose 24h or 1h reminder is due and not yet sent. */
export async function dueReminders(): Promise<DueReminder[]> {
  const r24 = await query<any>(
    `SELECT id, agent_id, tenant_id, contact_phone, contact_name, start_at, '24h' AS kind FROM appointments
     WHERE contact_phone IS NOT NULL AND reminder_24_at IS NULL
       AND start_at BETWEEN now() + interval '23 hours' AND now() + interval '24 hours'`,
  );
  const r1 = await query<any>(
    `SELECT id, agent_id, tenant_id, contact_phone, contact_name, start_at, '1h' AS kind FROM appointments
     WHERE contact_phone IS NOT NULL AND reminder_1_at IS NULL
       AND start_at BETWEEN now() + interval '50 minutes' AND now() + interval '70 minutes'`,
  );
  return [...r24, ...r1];
}
export const markReminderSent = (id: string, kind: '24h' | '1h') =>
  query(`UPDATE appointments SET ${kind === '24h' ? 'reminder_24_at' : 'reminder_1_at'}=now() WHERE id=$1`, [id]);

// ── SMS threads (two-way AI texting) ────────────────────────────────────
export interface SmsThread {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  call_id: string | null;
  contact_number: string;
  history: any[];
}
export const getSmsThread = (agentId: string, contact: string) =>
  one<SmsThread>(`SELECT * FROM sms_threads WHERE agent_id=$1 AND contact_number=$2`, [agentId, contact]);
export async function upsertSmsThread(
  agentId: string,
  tenantId: string | undefined,
  callId: string,
  contact: string,
  history: any[],
): Promise<void> {
  await query(
    `INSERT INTO sms_threads (agent_id, tenant_id, call_id, contact_number, history, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (agent_id, contact_number) DO UPDATE SET history=$5, call_id=$3, updated_at=now()`,
    [agentId, tenantId ?? null, callId, contact, JSON.stringify(history.slice(-20))],
  );
}
export function listSmsThreads(opts: { tenantId?: string } = {}) {
  if (opts.tenantId)
    return query(`SELECT id, contact_number, updated_at FROM sms_threads WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 200`, [opts.tenantId]);
  return query(`SELECT id, contact_number, updated_at FROM sms_threads ORDER BY updated_at DESC LIMIT 200`);
}

// ── Voicemails ──────────────────────────────────────────────────────────
export async function insertVoicemail(v: {
  agent_id: string;
  tenant_id?: string;
  call_id?: string;
  from_number?: string;
  recording_url?: string;
  transcript?: string;
}): Promise<string> {
  const row = await one<{ id: string }>(
    `INSERT INTO voicemails (agent_id, tenant_id, call_id, from_number, recording_url, transcript)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [v.agent_id, v.tenant_id ?? null, v.call_id ?? null, v.from_number ?? null, v.recording_url ?? null, v.transcript ?? null],
  );
  return row!.id;
}
export const setVoicemailTranscript = (callId: string, transcript: string, recordingUrl?: string) =>
  query(
    `UPDATE voicemails SET transcript=$2, recording_url=COALESCE($3, recording_url) WHERE call_id=$1`,
    [callId, transcript, recordingUrl ?? null],
  );
export function listVoicemails(opts: { agentId?: string; tenantId?: string } = {}) {
  if (opts.tenantId) return query(`SELECT * FROM voicemails WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`, [opts.tenantId]);
  if (opts.agentId) return query(`SELECT * FROM voicemails WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 200`, [opts.agentId]);
  return query(`SELECT * FROM voicemails ORDER BY created_at DESC LIMIT 200`);
}

// ── Calendar connections (per-tenant OAuth) ─────────────────────────────
export const getCalendarConnection = (tenantId: string) =>
  one<CalendarConnection>(`SELECT * FROM calendar_connections WHERE tenant_id=$1`, [tenantId]);

export const upsertCalendarConnection = (c: CalendarConnection) =>
  query(
    `INSERT INTO calendar_connections (tenant_id, provider, access_token, refresh_token, calendar_id, expiry)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id) DO UPDATE SET provider=$2, access_token=$3, refresh_token=$4, calendar_id=$5, expiry=$6`,
    [c.tenant_id, c.provider, c.access_token, c.refresh_token, c.calendar_id, c.expiry],
  );
