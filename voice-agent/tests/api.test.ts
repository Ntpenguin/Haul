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

describe('after-hours inbound handling', () => {
  const closed = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };

  it('returns voicemail TwiML when closed + after_hours=voicemail', async () => {
    const num = '+1512000' + Math.floor(1000 + Math.random() * 8999);
    await request(app).post('/api/agents').set('Authorization', `Bearer ${ADMIN}`)
      .send({ name: 'VM', business_name: 'VM Co', phone_number: num, business_hours: closed, after_hours: 'voicemail' });
    const res = await request(app).post('/twilio/inbound').type('form').send({ To: num, From: '+15125559999', CallSid: 'CAvm' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Record');
    expect(res.text).toContain('leave a message');
  });

  it('returns transfer TwiML when closed + after_hours=transfer', async () => {
    const num = '+1512111' + Math.floor(1000 + Math.random() * 8999);
    await request(app).post('/api/agents').set('Authorization', `Bearer ${ADMIN}`)
      .send({ name: 'XF', business_name: 'XF Co', phone_number: num, business_hours: closed, after_hours: 'transfer', transfer_number: '+15125550000' });
    const res = await request(app).post('/twilio/inbound').type('form').send({ To: num, From: '+15125559999', CallSid: 'CAxf' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Dial>+15125550000</Dial>');
  });
});

describe('agent templates + CSV export', () => {
  it('lists industry templates and creates an agent from one', async () => {
    const tpls = (await request(app).get('/api/agent-templates').set('Authorization', `Bearer ${ADMIN}`)).body;
    expect(tpls.some((t: any) => t.id === 'moving')).toBe(true);
    const agent = (await request(app).post('/api/agents').set('Authorization', `Bearer ${ADMIN}`)
      .send({ name: 'FromTpl', template: 'salon' })).body;
    expect(agent.enabled_tools).toContain('book_appointment');
    expect(agent.persona).toMatch(/salon|spa/i);
  });

  it('exports leads as CSV', async () => {
    const res = await request(app).get('/api/leads.csv').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\n')[0]).toBe('name,phone,email,notes,created_at');
  });
});

describe('two-way SMS agent', () => {
  it('answers an inbound text with the brain and books an appointment', async () => {
    const num = '+1512222' + Math.floor(1000 + Math.random() * 8999);
    await request(app).post('/api/agents').set('Authorization', `Bearer ${ADMIN}`)
      .send({ name: 'SMS', business_name: 'SMS Co', phone_number: num });
    const res = await request(app).post('/twilio/sms').type('form')
      .send({ From: '+15125557777', To: num, Body: 'I want to book a move' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Message>');
    // Mock brain: "happy to help" → checks availability → books → confirms.
    const res2 = await request(app).post('/twilio/sms').type('form')
      .send({ From: '+15125557777', To: num, Body: 'yes that works' });
    expect(res2.text).toMatch(/set|book|help/i);
    const appts = (await request(app).get('/api/appointments').set('Authorization', `Bearer ${ADMIN}`)).body;
    expect(appts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('number provisioning + file KB upload', () => {
  it('reports Twilio not configured for number search', async () => {
    const res = await request(app).get('/api/numbers/available').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(400); // no TWILIO_ACCOUNT_SID in tests
  });
  it('imports a knowledge base from an uploaded text file', async () => {
    const agent = (await request(app).post('/api/agents').set('Authorization', `Bearer ${ADMIN}`).send({ name: 'KBfile' })).body;
    const res = await request(app).post(`/api/agents/${agent.id}/upload-kb`)
      .set('Authorization', `Bearer ${ADMIN}`)
      .attach('file', Buffer.from('Hours: 9 to 5. We do residential moves in Austin.'), 'info.txt');
    expect(res.status).toBe(200);
    expect(res.body.knowledge_base).toMatch(/Austin/);
  });
});

describe('manage links + caller history', () => {
  it('books over SMS, then cancels via the public manage link', async () => {
    const num = '+1512333' + Math.floor(1000 + Math.random() * 8999);
    await request(app).post('/api/agents').set('Authorization', `Bearer ${ADMIN}`)
      .send({ name: 'Mng', business_name: 'Manage Co', phone_number: num });
    await request(app).post('/twilio/sms').type('form')
      .send({ From: '+15125558888', To: num, Body: 'book me an appointment' });
    await request(app).post('/twilio/sms').type('form')
      .send({ From: '+15125558888', To: num, Body: 'yes the first one works' });

    const appts = (await request(app).get('/api/appointments').set('Authorization', `Bearer ${ADMIN}`)).body;
    const mine = appts.find((a: any) => a.contact_phone === '+15125558888');
    expect(mine?.manage_token).toBeTruthy();

    const pg = await request(app).get(`/manage/${mine.manage_token}`);
    expect(pg.status).toBe(200);
    expect(pg.text).toContain('Manage Co');
    expect(pg.text).toContain('Cancel appointment');

    const cancel = await request(app).post(`/manage/${mine.manage_token}/cancel`);
    expect(cancel.text).toMatch(/cancelled/i);

    const after = (await request(app).get('/api/appointments').set('Authorization', `Bearer ${ADMIN}`)).body
      .find((a: any) => a.id === mine.id);
    expect(after.status).toBe('cancelled');

    expect((await request(app).get('/manage/not-a-token')).status).toBe(404);
  });

  it('returns caller history for a known phone number', async () => {
    const res = await request(app).get('/api/contact-history?phone=%2B15125558888').set('Authorization', `Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(res.body.calls.length + res.body.appointments.length).toBeGreaterThanOrEqual(1);
  });
});

describe('health', () => {
  it('reports liveness and readiness', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
    const r = await request(app).get('/readyz');
    expect(r.status).toBe(200);
  });
});
