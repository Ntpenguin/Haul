import express, { type Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { rootLogger, logger } from '../logger.js';
import { ping } from '../db/pool.js';
import { twimlRouter } from './twiml.js';
import { verifyTwilioSignature } from './twilioVerify.js';
import { apiRouter } from './api.js';
import { authRouter } from './authRoutes.js';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './auth.js';
import { handleStripeWebhook } from './billing.js';
import { googleExchangeAndStore } from '../integrations/googleCalendar.js';

const log = logger('app');
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Build the configured Express app (no listen / websocket) — used by the server + tests. */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Caddy/Fly/Render proxy
  if (!config.isTest) app.use(pinoHttp({ logger: rootLogger, autoLogging: { ignore: (r) => r.url === '/healthz' } }));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          // Voice preview clips (ElevenLabs → GCS) + blob: for authed recording playback.
          mediaSrc: ["'self'", 'blob:', 'https://storage.googleapis.com'],
        },
      },
    }),
  );

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.corsOrigin);
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', async (_req, res) => ((await ping()) ? res.json({ ok: true }) : res.status(503).json({ ok: false })));

  // Stripe webhook needs the RAW body for signature verification → before json().
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      await handleStripeWebhook(req.body as Buffer, req.header('stripe-signature') || '');
      res.json({ received: true });
    } catch (e) {
      log.error('stripe webhook error', e);
      res.status(400).send('webhook error');
    }
  });

  // Twilio webhooks: form-encoded + signature-verified, not behind admin/tenant auth.
  app.use('/twilio', express.urlencoded({ extended: false }), verifyTwilioSignature, twimlRouter);

  // Google OAuth callback — Google redirects the browser here (no bearer), so it lives
  // outside the API auth middleware; the signed `state` carries the tenant id.
  app.get('/calendar/google/callback', async (req, res) => {
    try {
      const { cal } = jwt.verify(String(req.query.state), config.jwtSecret) as { cal: string };
      await googleExchangeAndStore(cal, String(req.query.code));
      res.redirect('/?calendar=connected');
    } catch (e) {
      log.error('google callback failed', e);
      res.status(400).send('Calendar connection failed. Please try again.');
    }
  });

  app.use(express.json());

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, skip: () => config.isTest });
  app.use('/api/auth', authLimiter, authRouter);

  const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, skip: () => config.isTest });
  app.use('/api', apiLimiter, authMiddleware, apiRouter);

  app.use('/', express.static(resolve(__dirname, '../../public')));
  return app;
}
