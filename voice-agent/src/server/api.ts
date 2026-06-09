import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import {
  listAgents,
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  listCalls,
  getTranscript,
  listLeads,
  listAppointments,
  createCall,
  createTenant,
  getTenant,
  listTenants,
  updateTenant,
  deleteTenant,
  usageForTenant,
  tenantCanCall,
} from '../db/index.js';
import { Conversation } from '../pipeline/conversation.js';
import { makeLlm } from '../providers/index.js';
import { ToolContext } from '../agent/tools.js';
import { placeOutboundCall } from './twilioRest.js';
import { scopedTenantId, isAdmin, requireAdmin } from './auth.js';
import { logger } from '../logger.js';

const log = logger('api');
export const apiRouter = Router();

// In-memory text-simulator sessions (no audio) — for testing the agent brain.
const simSessions = new Map<string, { conv: Conversation }>();

/** Ensure the caller may touch this agent (tenants only see their own). */
function canAccessAgent(req: any, agentId: string) {
  const a = getAgent(agentId);
  if (!a) return null;
  const tid = scopedTenantId(req);
  if (req.principal?.type === 'tenant' && a.tenant_id !== tid) return null;
  return a;
}

// ── Tenants (admin only) ──
apiRouter.get('/tenants', requireAdmin, (_req, res) => res.json(listTenants()));
apiRouter.post('/tenants', requireAdmin, (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: 'name required' });
  res.status(201).json(createTenant(req.body));
});
apiRouter.get('/tenants/:id', requireAdmin, (req, res) => {
  const t = getTenant(req.params.id);
  return t ? res.json(t) : res.status(404).json({ error: 'not found' });
});
apiRouter.put('/tenants/:id', requireAdmin, (req, res) => {
  const t = updateTenant(req.params.id, req.body);
  return t ? res.json(t) : res.status(404).json({ error: 'not found' });
});
apiRouter.delete('/tenants/:id', requireAdmin, (req, res) => {
  deleteTenant(req.params.id);
  res.sendStatus(204);
});

// ── Usage / billing ──
apiRouter.get('/usage', (req, res) => {
  const tid = scopedTenantId(req);
  if (!tid) {
    // Admin with no filter → usage for every tenant this month.
    return res.json(listTenants().map((t) => ({ tenant: t.name, id: t.id, ...usageForTenant(t.id) })));
  }
  res.json({ tenantId: tid, month: new Date().toISOString().slice(0, 7), ...usageForTenant(tid, req.query.month as string) });
});

// ── Agents CRUD (tenant-scoped) ──
apiRouter.get('/agents', (req, res) => res.json(listAgents(scopedTenantId(req))));
apiRouter.post('/agents', (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: 'name required' });
  // Admins may assign a tenant via body.tenant_id; tenants always own their agents.
  const tid = req.principal?.type === 'tenant' ? req.principal.tenant.id : req.body.tenant_id;
  res.status(201).json(createAgent(req.body, tid));
});
apiRouter.get('/agents/:id', (req, res) => {
  const a = canAccessAgent(req, req.params.id);
  return a ? res.json(a) : res.status(404).json({ error: 'not found' });
});
apiRouter.put('/agents/:id', (req, res) => {
  if (!canAccessAgent(req, req.params.id)) return res.status(404).json({ error: 'not found' });
  const a = updateAgent(req.params.id, req.body);
  return a ? res.json(a) : res.status(404).json({ error: 'not found' });
});
apiRouter.delete('/agents/:id', (req, res) => {
  if (!canAccessAgent(req, req.params.id)) return res.status(404).json({ error: 'not found' });
  deleteAgent(req.params.id);
  res.sendStatus(204);
});

// ── Call logs / transcripts / CRM data (tenant-scoped) ──
apiRouter.get('/calls', (req, res) => res.json(listCalls({ tenantId: scopedTenantId(req) })));
apiRouter.get('/calls/:id/transcript', (req, res) => res.json(getTranscript(req.params.id)));
apiRouter.get('/leads', (req, res) => res.json(listLeads({ tenantId: scopedTenantId(req) })));
apiRouter.get('/appointments', (req, res) => res.json(listAppointments({ tenantId: scopedTenantId(req) })));

// ── Outbound call ──
apiRouter.post('/calls/outbound', async (req, res) => {
  const { agentId, to } = req.body || {};
  const agent = canAccessAgent(req, agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  if (!to) return res.status(400).json({ error: 'to required' });
  if (!config.twilio.accountSid) return res.status(400).json({ error: 'Twilio not configured' });
  if (agent.tenant_id && !tenantCanCall(agent.tenant_id))
    return res.status(402).json({ error: 'tenant suspended or over monthly minute limit' });

  const callId = createCall({ agent_id: agentId, tenant_id: agent.tenant_id, direction: 'outbound', to_number: to });
  const url = `${config.publicBaseUrl}/twilio/outbound-twiml?agentId=${agentId}&callId=${callId}`;
  const result = await placeOutboundCall(to, url);
  if (!result.ok) return res.status(502).json({ error: 'failed to place call' });
  res.json({ callId, sid: result.sid });
});

// ── Text simulator: drive the agent brain with no telephony ──
apiRouter.post('/simulate', async (req, res) => {
  const { agentId, message } = req.body || {};
  let sessionId: string = req.body?.sessionId;
  const agent = canAccessAgent(req, agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  let session = sessionId ? simSessions.get(sessionId) : undefined;
  const replies: string[] = [];
  let control: unknown = null;

  if (!session) {
    sessionId = randomUUID();
    const callId = createCall({ agent_id: agentId, tenant_id: agent.tenant_id, direction: 'inbound', from_number: 'simulator' });
    const ctx: ToolContext = { agent, callId, contact: {}, callerNumber: 'simulator' };
    const conv = new Conversation(makeLlm(), agent, ctx);
    session = { conv };
    simSessions.set(sessionId, session);
    replies.push(conv.greeting());
    if (!message) return res.json({ sessionId, replies, control });
  }

  if (message) {
    try {
      for await (const ev of session.conv.respondTo(message)) {
        if (ev.type === 'say') replies.push(ev.text);
        else if (ev.type === 'control') control = ev.action;
      }
    } catch (e) {
      log.error('simulate failed', e);
      return res.status(500).json({ error: 'llm error', detail: String(e) });
    }
    if (control) simSessions.delete(sessionId);
  }
  res.json({ sessionId, replies, control });
});

apiRouter.get('/health', (req, res) =>
  res.json({
    ok: true,
    role: isAdmin(req) ? 'admin' : 'tenant',
    providers: config.providers,
    twilio: Boolean(config.twilio.accountSid),
    publicBaseUrl: config.publicBaseUrl || null,
    tenants: isAdmin(req) ? listTenants().length : undefined,
  }),
);
