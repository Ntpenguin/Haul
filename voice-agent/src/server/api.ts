import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getCalendarConnection, getCall } from '../db/index.js';
import { googleAuthUrl } from '../integrations/googleCalendar.js';
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
  analyticsFor,
  listVoicemails,
} from '../db/index.js';
import { AGENT_TEMPLATES, getTemplate } from '../agent/templates.js';
import { toCsv } from './csv.js';
import { Conversation } from '../pipeline/conversation.js';
import { makeLlm, makeTts } from '../providers/index.js';
import { ToolContext } from '../agent/tools.js';
import { placeOutboundCall, fetchRecording } from './twilioRest.js';
import { createCheckoutSession } from './billing.js';
import { scrapeSite, buildKnowledgeBase } from '../integrations/scrape.js';
import { scopedTenantId, isAdmin, requireAdmin } from './auth.js';
import { logger } from '../logger.js';

const log = logger('api');
export const apiRouter = Router();

// In-memory text-simulator sessions (no audio) — for testing the agent brain.
const simSessions = new Map<string, { conv: Conversation }>();

/** Ensure the caller may touch this agent (tenants only see their own). */
async function canAccessAgent(req: any, agentId: string) {
  const a = await getAgent(agentId);
  if (!a) return null;
  if (req.principal?.type === 'tenant' && a.tenant_id !== req.principal.tenant.id) return null;
  return a;
}

// ── Tenants (admin only) ──
apiRouter.get('/tenants', requireAdmin, async (_req, res) => res.json(await listTenants()));
apiRouter.post('/tenants', requireAdmin, async (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: 'name required' });
  res.status(201).json(await createTenant(req.body));
});
apiRouter.get('/tenants/:id', requireAdmin, async (req, res) => {
  const t = await getTenant(req.params.id);
  return t ? res.json(t) : res.status(404).json({ error: 'not found' });
});
apiRouter.put('/tenants/:id', requireAdmin, async (req, res) => {
  const t = await updateTenant(req.params.id, req.body);
  return t ? res.json(t) : res.status(404).json({ error: 'not found' });
});
apiRouter.delete('/tenants/:id', requireAdmin, async (req, res) => {
  await deleteTenant(req.params.id);
  res.sendStatus(204);
});

// ── Usage / billing ──
apiRouter.get('/usage', async (req, res) => {
  const tid = scopedTenantId(req);
  if (!tid) {
    const tenants = await listTenants();
    return res.json(await Promise.all(tenants.map(async (t) => ({ tenant: t.name, id: t.id, ...(await usageForTenant(t.id)) }))));
  }
  res.json(await usageForTenant(tid, req.query.month as string));
});

// ── Billing: start a Stripe Checkout subscription (tenant self-serve) ──
apiRouter.post('/billing/checkout', async (req, res) => {
  if (req.principal?.type !== 'tenant') return res.status(400).json({ error: 'tenant context required' });
  if (!config.stripe.enabled) return res.status(400).json({ error: 'billing not configured' });
  const url = await createCheckoutSession(req.principal.tenant);
  if (!url) return res.status(500).json({ error: 'could not create checkout session' });
  res.json({ url });
});

// ── Calendar (Google) connection ──
apiRouter.get('/calendar/status', async (req, res) => {
  if (req.principal?.type !== 'tenant') return res.json({ connected: false });
  const c = await getCalendarConnection(req.principal.tenant.id);
  res.json({ connected: Boolean(c && c.refresh_token), provider: c?.provider ?? null, google_available: config.google.enabled });
});
apiRouter.post('/calendar/google/connect', async (req, res) => {
  if (!config.google.enabled) return res.status(400).json({ error: 'Google Calendar not configured' });
  if (req.principal?.type !== 'tenant') return res.status(400).json({ error: 'tenant context required' });
  const state = jwt.sign({ cal: req.principal.tenant.id }, config.jwtSecret, { expiresIn: '15m' });
  res.json({ url: googleAuthUrl(state) });
});

// ── Voices (for the agent voice picker) ──
let voiceCache: { at: number; voices: unknown[] } | null = null;
apiRouter.get('/voices', async (_req, res) => {
  if (voiceCache && Date.now() - voiceCache.at < 5 * 60 * 1000) return res.json(voiceCache.voices);
  const voices = await makeTts().listVoices();
  voiceCache = { at: Date.now(), voices };
  res.json(voices);
});

// ── Analytics (tenant-scoped; admin sees platform-wide) ──
apiRouter.get('/analytics', async (req, res) => res.json(await analyticsFor(scopedTenantId(req))));

// ── Agent templates (industry presets) ──
apiRouter.get('/agent-templates', (_req, res) =>
  res.json(AGENT_TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description }))),
);

// ── Agents CRUD (tenant-scoped) ──
apiRouter.get('/agents', async (req, res) => res.json(await listAgents(scopedTenantId(req))));
apiRouter.post('/agents', async (req, res) => {
  // Optionally seed from an industry template.
  const tpl = req.body?.template ? getTemplate(req.body.template) : undefined;
  const body = { ...(tpl?.config || {}), ...req.body };
  delete body.template;
  if (!body.name) return res.status(400).json({ error: 'name required' });
  const tid = req.principal?.type === 'tenant' ? req.principal.tenant.id : body.tenant_id;
  res.status(201).json(await createAgent(body, tid));
});
apiRouter.get('/agents/:id', async (req, res) => {
  const a = await canAccessAgent(req, req.params.id);
  return a ? res.json(a) : res.status(404).json({ error: 'not found' });
});
apiRouter.put('/agents/:id', async (req, res) => {
  if (!(await canAccessAgent(req, req.params.id))) return res.status(404).json({ error: 'not found' });
  const a = await updateAgent(req.params.id, req.body);
  return a ? res.json(a) : res.status(404).json({ error: 'not found' });
});
apiRouter.delete('/agents/:id', async (req, res) => {
  if (!(await canAccessAgent(req, req.params.id))) return res.status(404).json({ error: 'not found' });
  await deleteAgent(req.params.id);
  res.sendStatus(204);
});

// Import a knowledge base by scraping the business's website.
apiRouter.post('/agents/:id/scrape', async (req, res) => {
  const agent = await canAccessAgent(req, req.params.id);
  if (!agent) return res.status(404).json({ error: 'not found' });
  const url = (req.body?.url || '').trim();
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const text = await scrapeSite(url);
    if (!text) return res.status(422).json({ error: 'no readable text found at that URL' });
    const kb = await buildKnowledgeBase(text);
    const knowledge_base = req.body?.replace ? kb : [agent.knowledge_base, kb].filter(Boolean).join('\n\n');
    await updateAgent(agent.id, { knowledge_base });
    res.json({ knowledge_base });
  } catch (e: any) {
    log.error('scrape failed', e);
    res.status(502).json({ error: e?.message || 'scrape failed' });
  }
});

// ── Call logs / transcripts / CRM data (tenant-scoped) ──
apiRouter.get('/calls', async (req, res) => res.json(await listCalls({ tenantId: scopedTenantId(req) })));
apiRouter.get('/calls/:id/transcript', async (req, res) => res.json(await getTranscript(req.params.id)));

// Proxy a call recording (tenant-scoped) so the dashboard can play it without Twilio creds.
apiRouter.get('/calls/:id/recording', async (req, res) => {
  const call: any = await getCall(req.params.id);
  if (!call || !call.recording_url) return res.status(404).json({ error: 'no recording' });
  if (req.principal?.type === 'tenant' && call.tenant_id !== req.principal.tenant.id)
    return res.status(404).json({ error: 'not found' });
  const upstream = await fetchRecording(call.recording_url);
  if (!upstream || !upstream.body) return res.status(502).json({ error: 'recording unavailable' });
  res.setHeader('Content-Type', 'audio/mpeg');
  const reader = (upstream.body as any as AsyncIterable<Uint8Array>);
  for await (const chunk of reader) res.write(Buffer.from(chunk));
  res.end();
});
apiRouter.get('/leads', async (req, res) => res.json(await listLeads({ tenantId: scopedTenantId(req) })));
apiRouter.get('/appointments', async (req, res) => res.json(await listAppointments({ tenantId: scopedTenantId(req) })));
apiRouter.get('/voicemails', async (req, res) => res.json(await listVoicemails({ tenantId: scopedTenantId(req) })));

// ── CSV exports (tenant-scoped) ──
function sendCsv(res: any, name: string, rows: any[], cols: string[]) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send(toCsv(rows, cols));
}
apiRouter.get('/leads.csv', async (req, res) =>
  sendCsv(res, 'leads', await listLeads({ tenantId: scopedTenantId(req) }), ['name', 'phone', 'email', 'notes', 'created_at']),
);
apiRouter.get('/appointments.csv', async (req, res) =>
  sendCsv(res, 'appointments', await listAppointments({ tenantId: scopedTenantId(req) }), ['contact_name', 'contact_phone', 'contact_email', 'start_at', 'end_at', 'notes', 'created_at']),
);
apiRouter.get('/calls.csv', async (req, res) =>
  sendCsv(res, 'calls', await listCalls({ tenantId: scopedTenantId(req) }), ['from_number', 'to_number', 'direction', 'status', 'outcome', 'duration_sec', 'started_at']),
);

// ── Outbound call ──
apiRouter.post('/calls/outbound', async (req, res) => {
  const { agentId, to } = req.body || {};
  const agent = await canAccessAgent(req, agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  if (!to) return res.status(400).json({ error: 'to required' });
  if (!config.twilio.accountSid) return res.status(400).json({ error: 'Twilio not configured' });
  if (agent.tenant_id && !(await tenantCanCall(agent.tenant_id)))
    return res.status(402).json({ error: 'tenant suspended or over monthly minute limit' });

  const callId = await createCall({ agent_id: agentId, tenant_id: agent.tenant_id, direction: 'outbound', to_number: to });
  const url = `${config.publicBaseUrl}/twilio/outbound-twiml?agentId=${agentId}&callId=${callId}`;
  const result = await placeOutboundCall(to, url);
  if (!result.ok) return res.status(502).json({ error: 'failed to place call' });
  res.json({ callId, sid: result.sid });
});

// ── Text simulator: drive the agent brain with no telephony ──
apiRouter.post('/simulate', async (req, res) => {
  const { agentId, message } = req.body || {};
  let sessionId: string = req.body?.sessionId;
  const agent = await canAccessAgent(req, agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  let session = sessionId ? simSessions.get(sessionId) : undefined;
  const replies: string[] = [];
  let control: unknown = null;

  if (!session) {
    sessionId = randomUUID();
    const callId = await createCall({ agent_id: agentId, tenant_id: agent.tenant_id, direction: 'inbound', from_number: 'simulator' });
    const ctx: ToolContext = { agent, callId, contact: {}, callerNumber: 'simulator' };
    const conv = new Conversation(makeLlm(), agent, ctx);
    session = { conv };
    simSessions.set(sessionId, session);
    replies.push(await conv.greeting());
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

apiRouter.get('/health', async (req, res) =>
  res.json({
    ok: true,
    role: isAdmin(req) ? 'admin' : 'tenant',
    providers: config.providers,
    twilio: Boolean(config.twilio.accountSid),
    billing: config.stripe.enabled,
    publicBaseUrl: config.publicBaseUrl || null,
  }),
);
