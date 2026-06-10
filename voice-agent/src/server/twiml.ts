import { Router } from 'express';
import { config, streamWsUrl } from '../config.js';
import {
  agentForNumber, getAgent, createCall, callBySid, finishCall, tenantCanCall, setRecording,
  setOutcome, insertVoicemail, setVoicemailTranscript,
} from '../db/index.js';
import { isWithinBusinessHours } from '../agent/hours.js';
import { postWebhook } from '../integrations/webhook.js';
import { handleInboundSms } from '../integrations/smsAgent.js';
import { sendSms, isE164 } from './twilioRest.js';
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

  // After-hours handling: transfer or voicemail instead of the AI, if configured.
  if (!isWithinBusinessHours(agent) && agent.after_hours !== 'ai') {
    const baseUrl = config.publicBaseUrl;
    if (agent.after_hours === 'transfer' && agent.transfer_number) {
      await setOutcome(callId, 'transferred');
      res.type('text/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please hold while we connect you.</Say><Dial>${escapeXml(agent.transfer_number)}</Dial></Response>`,
      );
      return;
    }
    // Voicemail (also the fallback when 'transfer' has no number configured).
    await setOutcome(callId, 'voicemail');
    const action = `${baseUrl}/twilio/voicemail?agentId=${agent.id}&callId=${callId}`;
    const tcb = `${baseUrl}/twilio/voicemail-transcription?callId=${callId}`;
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Response>` +
        `<Say>Thanks for calling ${escapeXml(agent.business_name)}. We're currently closed. ` +
        `Please leave a message after the tone and we'll get back to you.</Say>` +
        `<Record action="${escapeXml(action)}" maxLength="120" playBeep="true" transcribe="true" transcribeCallback="${escapeXml(tcb)}"/>` +
        `<Say>We didn't catch a message. Goodbye.</Say><Hangup/></Response>`,
    );
    return;
  }

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

/** Twilio posts the finished recording here. */
twimlRouter.post('/recording-status', async (req, res) => {
  const callSid = req.body.CallSid as string;
  const url = req.body.RecordingUrl as string;
  if (callSid && url) await setRecording(callSid, url);
  res.sendStatus(204);
});

/** Voicemail: Twilio posts the recording when the caller finishes leaving a message. */
twimlRouter.post('/voicemail', async (req, res) => {
  const agentId = req.query.agentId as string;
  const callId = req.query.callId as string;
  const recordingUrl = req.body.RecordingUrl as string;
  const from = req.body.From as string;
  const agent = await getAgent(agentId);
  if (agent && callId) {
    await insertVoicemail({ agent_id: agentId, tenant_id: agent.tenant_id, call_id: callId, from_number: from, recording_url: recordingUrl });
    await finishCall(callId, 'completed', 'voicemail');
    await postWebhook(agent.webhook_url, { type: 'voicemail', agent_id: agentId, call_id: callId, from, recording_url: recordingUrl });
    if (isE164(agent.notify_number)) {
      await sendSms(agent.notify_number, `New voicemail for ${agent.business_name} from ${from || 'a caller'}.`, agent.phone_number);
    }
  }
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you. Goodbye.</Say><Hangup/></Response>`);
});

/** Twilio posts the voicemail transcription here (asynchronously). */
twimlRouter.post('/voicemail-transcription', async (req, res) => {
  const callId = req.query.callId as string;
  const text = req.body.TranscriptionText as string;
  if (callId && text) await setVoicemailTranscript(callId, text, req.body.RecordingUrl as string);
  res.sendStatus(204);
});

/** Inbound SMS: the same AI brain answers texts. */
twimlRouter.post('/sms', async (req, res) => {
  const from = req.body.From as string;
  const to = req.body.To as string;
  const body = ((req.body.Body as string) || '').trim();
  const agent = await agentForNumber(to);
  if (!agent || (agent.tenant_id && !(await tenantCanCall(agent.tenant_id)))) {
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    return;
  }
  let reply = 'Thanks for your message!';
  try {
    reply = await handleInboundSms(agent, from, to, body);
  } catch (e) {
    log.error('sms handling failed', e);
  }
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`);
});

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}
