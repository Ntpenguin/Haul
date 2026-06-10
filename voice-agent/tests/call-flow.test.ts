import { describe, it, expect, beforeAll, vi } from 'vitest';

// Capture the STT event callbacks so the test can "speak" as the caller, and avoid
// any real network by mocking the provider factory + Twilio REST.
const hooks = vi.hoisted(() => ({ sttEvents: null as any }));

vi.mock('../src/providers/index.js', async () => {
  const { MockLlm, MockTts } = await import('../src/providers/mock.js');
  return {
    makeStt: () => ({
      open: async (events: any) => {
        hooks.sttEvents = events;
        return { sendAudio() {}, close() {} };
      },
    }),
    makeLlm: () => new MockLlm(),
    makeTts: () => new MockTts(),
  };
});

vi.mock('../src/server/twilioRest.js', () => ({
  updateCallTwiml: async () => true,
  transferTwiml: () => '<Response><Dial/></Response>',
  hangupTwiml: () => '<Response><Hangup/></Response>',
  startRecording: async () => true,
  placeOutboundCall: async () => ({ ok: true }),
  sendSms: async () => false,
  fetchRecording: async () => null,
  isE164: (s: string) => !!s && /^\+?[1-9]\d{7,14}$/.test(String(s).replace(/[\s()-]/g, '')),
}));

const { CallSession } = await import('../src/pipeline/session.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { pool } = await import('../src/db/pool.js');
const { createAgent, createCall, listAppointments, getTranscript, getCall } = await import('../src/db/index.js');

beforeAll(async () => {
  await runMigrations();
  await pool.query('TRUNCATE tenants, agents, calls, transcript_turns, appointments, leads, calendar_connections RESTART IDENTITY CASCADE');
});

function fakeWs() {
  const sent: any[] = [];
  const ws: any = {
    OPEN: 1,
    readyState: 1,
    send: (s: string) => sent.push(JSON.parse(s)),
    close: () => { ws.readyState = 3; },
  };
  return { ws, sent };
}

/** Single timer wait — lets the session's async work drain before we assert. */
const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

describe('full simulated phone call (no external APIs)', () => {
  it('greets, books on request, barges in, records transcript, and hangs up', async () => {
    const agent = await createAgent({ name: 'Flow', business_name: 'Flow Co' } as any);
    const callId = await createCall({ agent_id: agent.id, direction: 'inbound', from_number: '+15125559999' });

    const { ws, sent } = fakeWs();
    const session = new CallSession(ws, agent, callId, '+15125559999');

    // Twilio opens the media stream and sends the `start` frame → agent greets.
    await session.onTwilioMessage(
      JSON.stringify({ event: 'start', start: { streamSid: 'MZ1', callSid: 'CA1', customParameters: {} } }),
    );

    // STT is now open, and the greeting was synthesized → audio + a mark were sent.
    expect(hooks.sttEvents).toBeTruthy();
    expect(sent.some((m) => m.event === 'media')).toBe(true);
    expect(sent.some((m) => m.event === 'mark')).toBe(true);

    // Caller speaks while the agent's greeting audio is still "playing" → barge-in.
    sent.length = 0;
    hooks.sttEvents.onFinal('I want to book an appointment', true);
    expect(sent.some((m) => m.event === 'clear')).toBe(true); // barge-in flushed audio

    // The brain runs the tool loop (check_availability → book_appointment) and books.
    await settle();
    const appts = await listAppointments({ agentId: agent.id });
    expect(appts.length).toBe(1);
    expect(sent.some((m) => m.event === 'media')).toBe(true); // agent spoke its response

    // The transcript captured caller, assistant, and tool turns.
    const roles = new Set((await getTranscript(callId)).map((t: any) => t.role));
    expect(roles.has('user')).toBe(true);
    expect(roles.has('assistant')).toBe(true);
    expect(roles.has('tool')).toBe(true);

    // Caller ends the call → agent says goodbye → end_call → call completed + socket closed.
    hooks.sttEvents.onFinal("no that's all, goodbye", true);
    await settle(2000); // brain turn + applyControl's ~600ms hangup delay
    const c: any = await getCall(callId);
    expect(c.status).toBe('completed');
    expect(ws.readyState).toBe(3);
  });
});
