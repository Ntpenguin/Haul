import { listAgents, digestStats } from '../db/index.js';
import { sendEmail } from './email.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const log = logger('digest');

async function postSlack(webhookUrl: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch (e) {
    log.error('slack post failed', e);
    return false;
  }
}

/** Send the last-24h activity digest for every agent that opted in. */
export async function sendDailyDigests(): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let sent = 0;
  for (const agent of await listAgents()) {
    if (!agent.daily_digest) continue;
    if (!agent.notify_email && !agent.slack_webhook_url) continue;
    const s = await digestStats(agent.id, since);
    if (s.calls === 0 && s.booked === 0 && s.leads === 0 && s.voicemails === 0) continue; // quiet day — skip
    const text =
      `Daily digest — ${agent.business_name}\n` +
      `📞 ${s.calls} calls (${s.minutes} min) · 📅 ${s.booked} booked · 📇 ${s.leads} leads · 📨 ${s.voicemails} voicemails`;
    if (agent.slack_webhook_url) await postSlack(agent.slack_webhook_url, text);
    if (agent.notify_email) await sendEmail(agent.notify_email, `Daily digest — ${agent.business_name}`, text);
    sent++;
  }
  if (sent) log.info(`sent ${sent} daily digests`);
  return sent;
}

let lastDigestDay = '';

/** Hourly tick: fire the digest once per day at the configured UTC hour. */
export async function digestTick(now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() !== config.digestUtcHour || lastDigestDay === day) return;
  lastDigestDay = day;
  await sendDailyDigests();
}
