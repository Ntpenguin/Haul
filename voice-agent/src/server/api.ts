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
} from '../db/index.js';
import { Conversation } from '../pipeline/conversation.js';
import { makeLlm } from '../providers/index.js';
import { ToolContext } from '../agent/tools.js';
import { placeOutboundCall } from './twilioRest.js';
import { logger } from '../logger.js';

const log = logger('api');
export const apiRouter = Router();

// In-memory text-simulator sessions (no audio) — for testing the agent brain.
const simSessions = new Map<string, { conv: Conversation }>();

// ── Agents CRUD ──
apiRouter.get('/agents', (_req, res) => res.json(listAgents()));
apiRouter.post('/agents', (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: 'name required' });
  res.status(201).json(createAgent(req.body));
});
apiRouter.get('/agents/:id', (req, res) => {
  const a = getAgent(req.params.id);
  return a ? res.json(a) : res.status(404).json({ error: 'not found' });
});
apiRouter.put('/agents/:id', (req, res) => {
  const a = updateAgent(req.params.id, req.body);
  return a ? res.json(a) : res.status(404).json({ error: 'not found' });
});
apiRouter.delete('/agents/:id', (req, res) => {
  deleteAgent(req.params.id);
  res.sendStatus(204);
});

// ── Call logs / transcripts / CRM data ──
apiRouter.get('/calls', (req, res) => res.json(listCalls(req.query.agentId as string | undefined)));
apiRouter.get('/calls/:id/transcript', (req, res) => res.json(getTranscript(req.params.id)));
apiRouter.get('/leads', (req, res) => res.json(listLeads(req.query.agentId as string | undefined)));
apiRouter.get('/appointments', (req, res) => res.json(listAppointments(req.query.agentId as string | undefined)));

// ── Outbound call ──
apiRouter.post('/calls/outbound', async (req, res) => {
  const { agentId, to } = req.body || {};
  const agent = getAgent(agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  if (!to) return res.status(400).json({ error: 'to required' });
  if (!config.twilio.accountSid) return res.status(400).json({ error: 'Twilio not configured' });

  const callId = createCall({ agent_id: agentId, direction: 'outbound', to_number: to });
  const url = `${config.publicBaseUrl}/twilio/outbound-twiml?agentId=${agentId}&callId=${callId}`;
  const result = await placeOutboundCall(to, url);
  if (!result.ok) return res.status(502).json({ error: 'failed to place call' });
  res.json({ callId, sid: result.sid });
});

// ── Text simulator: drive the agent brain with no telephony ──
apiRouter.post('/simulate', async (req, res) => {
  const { agentId, message } = req.body || {};
  let sessionId: string = req.body?.sessionId;
  const agent = getAgent(agentId);
  if (!agent) return res.status(404).json({ error: 'agent not found' });

  let session = sessionId ? simSessions.get(sessionId) : undefined;
  const replies: string[] = [];
  let control: unknown = null;

  if (!session) {
    // New simulated call → seed greeting.
    sessionId = randomUUID();
    const callId = createCall({ agent_id: agentId, direction: 'inbound', from_number: 'simulator' });
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

apiRouter.get('/health', (_req, res) =>
  res.json({
    ok: true,
    providers: config.providers,
    twilio: Boolean(config.twilio.accountSid),
    publicBaseUrl: config.publicBaseUrl || null,
  }),
);
