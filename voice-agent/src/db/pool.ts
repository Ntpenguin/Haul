import pg from 'pg';
import { config } from '../config.js';

// Parse numeric/bigint columns we control as JS numbers (safe for our ranges).
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Managed Postgres (Render/Fly/RDS) usually needs SSL; allow self-signed.
  ssl: /sslmode=require/.test(config.databaseUrl) || (config.isProd && !/localhost|127\.0\.0\.1/.test(config.databaseUrl))
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params as any[]);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function ping(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool() {
  await pool.end();
}
