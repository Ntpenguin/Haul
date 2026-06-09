import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, streamWsUrl } from './config.js';
import { rootLogger, logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { ping, closePool } from './db/pool.js';
import { getAgent } from './db/index.js';
import { twimlRouter } from './server/twiml.js';
import { verifyTwilioSignature } from './server/twilioVerify.js';
import { apiRouter } from './server/api.js';
import { authRouter } from './server/authRoutes.js';
import { authMiddleware } from './server/auth.js';
import { handleStripeWebhook, reportUsageToStripe } from './server/billing.js';
import { CallSession } from './pipeline/session.js';

const log = logger('server');
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  await runMigrations();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Caddy/Fly/Render proxy
  app.use(pinoHttp({ logger: rootLogger, autoLogging: { ignore: (r) => r.url === '/healthz' } }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );

  // Minimal CORS for the API (dashboard may be served from another origin).
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.corsOrigin);
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Health/readiness (before auth & body parsing).
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', async (_req, res) => ((await ping()) ? res.json({ ok: true }) : res.status(503).json({ ok: false })));

  // Stripe webhook needs the RAW body for signature verification → mount before json().
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      await handleStripeWebhook(req.body as Buffer, req.header('stripe-signature') || '');
      res.json({ received: true });
    } catch (e) {
      log.error('stripe webhook error', e);
      res.status(400).send('webhook error');
    }
  });

  // Twilio webhooks: form-encoded + signature-verified. NOT behind the admin/tenant auth.
  app.use('/twilio', express.urlencoded({ extended: false }), verifyTwilioSignature, twimlRouter);

  // JSON for the rest.
  app.use(express.json());

  // Auth endpoints (public) get a stricter rate limit.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.use('/api/auth', authLimiter, authRouter);

  // Everything else under /api requires admin token or tenant credentials.
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false });
  app.use('/api', apiLimiter, authMiddleware, apiRouter);

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

  server.listen(config.port, () => {
    log.info(`OpenVoice Agent v1 listening on :${config.port} (${config.env})`);
    log.info(`Dashboard: ${config.publicBaseUrl || `http://localhost:${config.port}`}/`);
    log.info(`Twilio inbound webhook: ${config.publicBaseUrl || '<PUBLIC_BASE_URL>'}/twilio/inbound`);
    log.info(`Media stream WS: ${streamWsUrl()}`);
    if (!config.publicBaseUrl) log.warn('PUBLIC_BASE_URL not set — telephony will not work until you set it.');
    if (!config.stripe.enabled) log.warn('Stripe not configured — billing endpoints disabled.');
  });

  // Graceful shutdown.
  const shutdown = async (sig: string) => {
    log.info(`${sig} received — shutting down`);
    if (usageTimer) clearInterval(usageTimer);
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
