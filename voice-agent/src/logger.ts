import pino from 'pino';
import { config } from './config.js';

/** Structured JSON logging in prod; pretty-ish single line in dev via pino defaults. */
export const rootLogger = pino({
  level: config.logLevel,
  base: undefined, // omit pid/hostname noise
  redact: {
    paths: ['*.api_key', '*.password', '*.password_hash', 'req.headers.authorization'],
    censor: '[redacted]',
  },
});

/** Backwards-compatible scoped logger used across the codebase. */
export function logger(scope: string) {
  const child = rootLogger.child({ scope });
  return {
    debug: (m: string, e?: unknown) => (e !== undefined ? child.debug({ e }, m) : child.debug(m)),
    info: (m: string, e?: unknown) => (e !== undefined ? child.info({ e }, m) : child.info(m)),
    warn: (m: string, e?: unknown) => (e !== undefined ? child.warn({ e }, m) : child.warn(m)),
    error: (m: string, e?: unknown) => (e !== undefined ? child.error({ e }, m) : child.error(m)),
  };
}
