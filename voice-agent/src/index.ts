import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, streamWsUrl } from './config.js';
import { logger } from './logger.js';
import { twimlRouter } from './server/twiml.js';
import { apiRouter } from './server/api.js';
import { authMiddleware } from './server/auth.js';
import { getAgent } from './db/index.js';
import { CallSession } from './pipeline/session.js';

const log = logger('server');
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio webhooks are form-encoded
app.use(express.json());

// Twilio webhooks (must NOT require the admin token — Twilio can't send it).
app.use('/twilio', twimlRouter);

// Auth: platform admin (ADMIN_TOKEN) or tenant api_key. See server/auth.ts.
app.use('/api', authMiddleware);
app.use('/api', apiRouter);

// Static dashboard.
app.use('/', express.static(resolve(__dirname, '../public')));

const server = createServer(app);

// ── Twilio Media Streams websocket ──
const wss = new WebSocketServer({ server, path: '/twilio/stream' });
wss.on('connection', (ws) => {
  let session: CallSession | null = null;
  ws.on('message', async (data) => {
    const raw = data.toString();
    if (!session) {
      // Wait for the 'start' frame to learn which agent/call this is.
      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.event === 'start') {
        const params = msg.start?.customParameters || {};
        const agent = getAgent(params.agentId);
        if (!agent || !params.callId) {
          log.warn('stream start without valid agent/call params', params);
          ws.close();
          return;
        }
        session = new CallSession(ws, agent, params.callId, params.from);
        await session.onTwilioMessage(raw); // hand the start frame to the session
      }
      return;
    }
    await session.onTwilioMessage(raw);
  });
  ws.on('close', () => session?.cleanup('completed'));
  ws.on('error', (e) => log.error('ws error', e));
});

server.listen(config.port, () => {
  log.info(`OpenVoice Agent listening on :${config.port}`);
  log.info(`Dashboard:  ${config.publicBaseUrl || `http://localhost:${config.port}`}/`);
  log.info(`Inbound webhook (set in Twilio): ${config.publicBaseUrl || '<PUBLIC_BASE_URL>'}/twilio/inbound`);
  log.info(`Media stream WS: ${streamWsUrl()}`);
  if (!config.publicBaseUrl) log.warn('PUBLIC_BASE_URL not set — telephony will not work until you set it.');
});
