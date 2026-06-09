import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { logger } from '../logger.js';

const log = logger('migrate');
const __dirname = dirname(fileURLToPath(import.meta.url));
// migrations/ sits at the project root; from src/db (dev) or dist/db (prod) it's ../../migrations
const MIGRATIONS_DIR = resolve(__dirname, '../../migrations');

/** Apply any pending SQL migrations, in filename order, inside a transaction each. */
export async function runMigrations(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name as string),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log.info(`applied migration ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      log.error(`migration ${file} failed`, e);
      throw e;
    } finally {
      client.release();
    }
  }
  log.info('migrations up to date');
}

// Allow running directly: `npm run migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
