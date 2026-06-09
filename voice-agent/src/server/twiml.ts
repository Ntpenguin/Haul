import { Router } from 'express';
import { config, streamWsUrl } from '../config.js';
import { agentForNumber, getAgent, createCall, callBySid, finishCall, tenantCanCall } from '../db/index.js';
import { logger } from '../logger.js';

const log = logger('twiml');
export const twimlRouter = Router();

function streamTwiml(params: Record<string, string>): string {
  const paramTags = Object.entries(params)
    .map(([k, v]) => `<Parameter name="${k}" value="${escapeXml(v)}"/>`)
    .join('');
  // <Connect><Stream> is bidirectional — required so we can send audio back to the caller.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Connect><Stream url="${streamWsUrl()}">${paramTags}</Stream></Connect></Response>`
  );
}

/** Inbound call: Twilio POSTs here when someone calls the number. */
twimlRouter.post('/inbound', async (req, res) => {
  const to = req.body.To as string;
  const from = req.body.From as string;
  const callSid = req.body.CallSid as string;
  const agent = await agentForNumber(to);
  if (!agent) {
    log.warn(`no agent for ${to}`);
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, no agent is configured for this number.</Say><Hangup/></Response>`,
    );
    return;
  }
  // Billing/usage gate: don't answer for suspended or over-limit tenants.
  if (agent.tenant_id && !(await tenantCanCall(agent.tenant_id))) {
    log.warn(`tenant ${agent.tenant_id} cannot take calls (suspended/over limit)`);
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're sorry, this line is temporarily unavailable.</Say><Hangup/></Response>`,
    );
    return;
  }
  const callId = await createCall({ agent_id: agent.id, tenant_id: agent.tenant_id, direction: 'inbound', from_number: from, to_number: to, call_sid: callSid });
  log.info(`inbound ${from} -> ${to} (agent ${agent.name}, call ${callId})`);
  res.type('text/xml').send(streamTwiml({ agentId: agent.id, callId, from }));
});

/** Outbound call: Twilio fetches this when our placed call connects. */
twimlRouter.all('/outbound-twiml', async (req, res) => {
  const agentId = (req.query.agentId || req.body?.agentId) as string;
  const callId = (req.query.callId || req.body?.callId) as string;
  const to = (req.body?.To || req.query.to) as string;
  const agent = await getAgent(agentId);
  if (!agent) {
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    return;
  }
  res.type('text/xml').send(streamTwiml({ agentId, callId, from: to || '' }));
});

/** Optional status callback to finalize call rows. */
twimlRouter.post('/status', async (req, res) => {
  const callSid = req.body.CallSid as string;
  const status = req.body.CallStatus as string;
  if (callSid && ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status)) {
    const row: any = await callBySid(callSid);
    if (row && !row.ended_at) await finishCall(row.id, status === 'completed' ? 'completed' : 'failed');
  }
  res.sendStatus(204);
});

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}
