/** Tiny leveled logger. Keeps call-scoped context (callSid) readable in logs. */
type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold: Level = (process.env.LOG_LEVEL as Level) || 'info';

function log(level: Level, scope: string, msg: string, extra?: unknown) {
  if (order[level] < order[threshold]) return;
  const ts = new Date().toISOString();
  const line = `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra !== undefined) fn(line, extra);
  else fn(line);
}

export function logger(scope: string) {
  return {
    debug: (m: string, e?: unknown) => log('debug', scope, m, e),
    info: (m: string, e?: unknown) => log('info', scope, m, e),
    warn: (m: string, e?: unknown) => log('warn', scope, m, e),
    error: (m: string, e?: unknown) => log('error', scope, m, e),
  };
}
