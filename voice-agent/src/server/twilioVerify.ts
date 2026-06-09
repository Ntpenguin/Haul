import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';

const log = logger('twilio-verify');

/**
 * Validate Twilio's X-Twilio-Signature so only Twilio can drive call webhooks.
 * Algorithm: HMAC-SHA1 over (full URL + sorted POST params concatenated), base64,
 * keyed by the Twilio auth token. https://www.twilio.com/docs/usage/security
 */
export function verifyTwilioSignature(req: Request, res: Response, next: NextFunction) {
  if (!config.twilio.validateSignature || !config.twilio.authToken) return next();

  const signature = req.header('X-Twilio-Signature');
  if (!signature) {
    log.warn('missing X-Twilio-Signature');
    return res.status(403).send('Forbidden');
  }

  // Reconstruct the exact URL Twilio signed (it used PUBLIC_BASE_URL).
  const base = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  const url = base.replace(/\/$/, '') + req.originalUrl;

  const params = req.body && typeof req.body === 'object' ? req.body : {};
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);

  const expected = crypto.createHmac('sha1', config.twilio.authToken).update(Buffer.from(data, 'utf-8')).digest('base64');

  const ok =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!ok) {
    log.warn('invalid Twilio signature');
    return res.status(403).send('Forbidden');
  }
  next();
}
