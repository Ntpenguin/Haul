import { config } from '../config.js';
import { logger } from '../logger.js';
import { getCall, getTranscript } from '../db/index.js';
import { AgentConfig } from '../agent/types.js';

const log = logger('email');

/** Send an email via Resend. No-ops (returns false) if not configured. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!config.email.enabled || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, to, subject, text }),
    });
    if (!res.ok) log.warn(`sendEmail HTTP ${res.status}`, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    log.error('sendEmail failed', e);
    return false;
  }
}

/** Email a post-call recap (transcript + outcome) to the agent's notify_email. */
export async function emailCallSummary(agent: AgentConfig, callId: string): Promise<void> {
  if (!config.email.enabled || !agent.notify_email) return;
  const call: any = await getCall(callId);
  if (!call) return;
  const turns = await getTranscript(callId);
  if (!turns.length) return;
  const transcript = turns.map((t: any) => `${t.role}: ${t.content}`).join('\n');
  const subject = `Call summary — ${agent.business_name} (${call.outcome || 'no action'})`;
  const text =
    `Call from ${call.from_number || 'unknown'} on ${new Date(call.started_at).toLocaleString()}\n` +
    `Duration: ${call.duration_sec || 0}s · Outcome: ${call.outcome || '—'}\n\n` +
    `Transcript:\n${transcript}`;
  await sendEmail(agent.notify_email, subject, text);
}
