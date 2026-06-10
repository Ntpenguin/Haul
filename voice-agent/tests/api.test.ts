import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';

const app = createApp();
const ADMIN = 'test-admin-token';

beforeAll(async () => {
  await runMigrations();
  await pool.query('TRUNCATE tenants, agents, calls, transcript_turns, appointments, leads, calendar_connections RESTART IDENTITY CASCADE');
});
// The pg pool is a singleton shared across test files (singleFork); the worker
// process exits at the end of the run, so we don't close it per-file.

describe('tenant self-serve auth', () => {
  let token = '';
  const email = `t${Date.now()}@example.com`;

  it('signs up a tenant and returns a JWT', async () => {
    const res = await request(app).post('/api/auth/signup').send({ name: 'Acme', email, password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tenant.api_key).toMatch(/^ova_/);
    token = res.body.token;
  });

  it('rejects duplicate signup', async () => {
    const res = await request(app).post('/api/auth/signup').send({ name: 'Acme2', email, password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app).post('/api/auth/signup').send({ name: 'x', email: 'x@y.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials, rejects wrong', async () => {
    expect((await request(app).post('/api/auth/login').send({ email, password: 'wrong' })).status).toBe(401);
    const ok = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
  });

  it('creates a tenant-scoped agent via JWT', async () => {
    const res = await request(app).post('/api/agents').set('Authorization', `Bearer ${token}`).send({ name: 'Reception' });
    expect(res.status).toBe(201);
    expect(res.body.tenant_id).toBeTruthy();
  });
});

describe('authorization & isolation', () => {
  it('isolates tenant data and enforces admin-only routes', async () => {
    // Tenant A
    const a = (await request(app).post('/api/auth/signup').send({ name: 'A', email: `a${Date.now()}@x.com`, password: 'password123' })).body.token;
    await request(app).post('/api/agents').set('Authorization', `Bearer ${a}`).send({ name: 'A-agent' });

    // Admin makes Tenant B + its agent
    const b = (await request(app).post('/api/tenants').set('Authorization', `Bearer ${ADMIN}`).send({ name: 'B' })).body;
    await request(app).post('/api/agents').set('Authorization', `Bearer ${b.api_key}`).send({ name: 'B-agent' });

    // A sees only its own agent
    const aAgents = (await request(app).get('/api/agents').set('Authorization', `Bearer ${a}`)).body;
    expect(aAgents.every((x: any) => x.name !== 'B-agent')).toBe(true);
    expect(aAgents.some((x: any) => x.name === 'A-agent')).toBe(true);

    // Admin sees everything
    const all = (await request(app).get('/api/agents').set('Authorization', `Bearer ${ADMIN}`)).body;
    expect(all.length).toBeGreaterThanOrEqual(2);

    // Tenant blocked from admin route; no-auth blocked
    expect((await request(app).get('/api/tenants').set('Authorization', `Bearer ${a}`)).status).toBe(403);
    expect((await request(app).get('/api/agents')).status).toBe(401);
  });
});

describe('health', () => {
  it('reports liveness and readiness', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
    const r = await request(app).get('/readyz');
    expect(r.status).toBe(200);
  });
});
