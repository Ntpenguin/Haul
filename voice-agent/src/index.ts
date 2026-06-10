import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { config, streamWsUrl } from './config.js';
import { logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { closePool } from './db/pool.js';
import { getAgent } from './db/index.js';
import { createApp } from './server/app.js';
import { reportUsageToStripe } from './server/billing.js';
import { processDueReminders } from './integrations/reminders.js';
import { digestTick } from './integrations/digest.js';
import { CallSession } from './pipeline/session.js';

const log = logger('server');

async function main() {
  await runMigrations();

  const app = createApp();
  const server = createServer(app);

  // ── Twilio Media Streams websocket ──
  const wss = new WebSocketServer({ server, path: '/twilio/stream' });
  wss.on('connection', (ws) => {
    let session: CallSession | null = null;
    ws.on('message', async (data) => {
      const raw = data.toString();
      if (!session) {
        let msg: any;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
        if (msg.event === 'start') {
          const params = msg.start?.customParameters || {};
          const agent = await getAgent(params.agentId);
          if (!agent || !params.callId) {
            log.warn('stream start without valid agent/call params');
            ws.close();
            return;
          }
          session = new CallSession(ws, agent, params.callId, params.from);
          await session.onTwilioMessage(raw);
        }
        return;
      }
      await session.onTwilioMessage(raw);
    });
    ws.on('close', () => session?.cleanup('completed'));
    ws.on('error', (e) => log.error('ws error', e));
  });

  // Periodic Stripe usage metering.
  let usageTimer: NodeJS.Timeout | undefined;
  if (config.stripe.enabled && config.stripe.priceMetered) {
    usageTimer = setInterval(() => reportUsageToStripe().catch((e) => log.error('usage report failed', e)), 5 * 60 * 1000);
  }

  // Appointment reminders (24h + 1h before).
  const reminderTimer = setInterval(() => processDueReminders().catch((e) => log.error('reminders failed', e)), 5 * 60 * 1000);

  // Daily owner digest (email/Slack) — checked hourly, fires once a day.
  const digestTimer = setInterval(() => digestTick().catch((e) => log.error('digest failed', e)), 60 * 60 * 1000);

  server.listen(config.port, () => {
    log.info(`OpenVoice Agent v1 listening on :${config.port} (${config.env})`);
    log.info(`Dashboard: ${config.publicBaseUrl || `http://localhost:${config.port}`}/`);
    log.info(`Twilio inbound webhook: ${config.publicBaseUrl || '<PUBLIC_BASE_URL>'}/twilio/inbound`);
    log.info(`Media stream WS: ${streamWsUrl()}`);
    if (!config.publicBaseUrl) log.warn('PUBLIC_BASE_URL not set — telephony will not work until you set it.');
    if (!config.stripe.enabled) log.warn('Stripe not configured — billing endpoints disabled.');
  });

  const shutdown = async (sig: string) => {
    log.info(`${sig} received — shutting down`);
    if (usageTimer) clearInterval(usageTimer);
    clearInterval(reminderTimer);
    clearInterval(digestTimer);
    server.close();
    wss.close();
    await closePool().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  log.error('fatal boot error', e);
  process.exit(1);
});
