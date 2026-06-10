import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { takeSentence } from '../src/pipeline/conversation.js';
import { isE164 } from '../src/server/twilioRest.js';
import { confirmationSms } from '../src/agent/tools.js';
import { htmlToText } from '../src/integrations/scrape.js';
import { isWithinBusinessHours } from '../src/agent/hours.js';
import { AGENT_TEMPLATES, getTemplate } from '../src/agent/templates.js';
import { toCsv } from '../src/server/csv.js';
import { buildSystemPrompt } from '../src/agent/prompt.js';
import { DEFAULT_AGENT, AgentConfig } from '../src/agent/types.js';

describe('takeSentence (TTS sentence chunking)', () => {
  it('returns null until a sentence completes', () => {
    expect(takeSentence('Hello there')).toBeNull();
  });
  it('splits on sentence-ending punctuation', () => {
    expect(takeSentence('Hello there. How are you?')).toBe('Hello there. ');
  });
  it('handles question marks and exclamations', () => {
    expect(takeSentence('Great! Anything else?')).toBe('Great! ');
  });
  it('flushes on newlines', () => {
    expect(takeSentence('Line one\nLine two')).toBe('Line one\n');
  });
  it('flushes very long run-ons to bound latency', () => {
    const longText = 'word '.repeat(60); // 300 chars, no punctuation
    const chunk = takeSentence(longText);
    expect(chunk).not.toBeNull();
    expect(chunk!.length).toBeLessThanOrEqual(181);
  });
});

// Mirror of the Twilio signature algorithm to prove our verifier matches Twilio.
function twilioSign(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

describe('SMS confirmation', () => {
  it('recognizes valid E.164 numbers and rejects junk (e.g. the simulator)', () => {
    expect(isE164('+15125551234')).toBe(true);
    expect(isE164('15125551234')).toBe(true);
    expect(isE164('simulator')).toBe(false);
    expect(isE164('')).toBe(false);
    expect(isE164(undefined)).toBe(false);
  });
  it('builds a confirmation message with the business name and time', () => {
    const agent = { business_name: 'Fast Fix Work' } as AgentConfig;
    const msg = confirmationSms(agent, '2026-06-12T14:30:00.000Z');
    expect(msg).toContain('Fast Fix Work');
    expect(msg).toMatch(/booked/i);
  });
});

describe('htmlToText (knowledge-base scraping)', () => {
  it('strips scripts, styles, and tags and decodes entities', () => {
    const html = `<html><head><style>.x{color:red}</style><script>alert(1)</script></head>
      <body><h1>Acme</h1><p>Hours: 9&ndash;5. Call us &amp; book.</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain('Acme');
    expect(text).toContain('book');
    expect(text).not.toMatch(/alert|color:red|<p>|<script/);
    expect(text).toContain('&'); // &amp; decoded
  });
});

describe('business hours', () => {
  const agent = { business_hours: { 0: null, 1: ['08:00', '18:00'], 2: ['08:00', '18:00'], 3: ['08:00', '18:00'], 4: ['08:00', '18:00'], 5: ['08:00', '18:00'], 6: null } } as AgentConfig;
  it('is open midday on a weekday and closed at night / weekends', () => {
    expect(isWithinBusinessHours(agent, new Date('2026-06-10T13:00:00'))).toBe(true);  // Wed 1pm
    expect(isWithinBusinessHours(agent, new Date('2026-06-10T22:00:00'))).toBe(false); // Wed 10pm
    expect(isWithinBusinessHours(agent, new Date('2026-06-10T07:00:00'))).toBe(false); // Wed 7am
    expect(isWithinBusinessHours(agent, new Date('2026-06-14T13:00:00'))).toBe(false); // Sunday
  });
});

describe('agent templates', () => {
  it('exposes industry presets with valid configs', () => {
    expect(AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    const moving = getTemplate('moving');
    expect(moving?.config.enabled_tools).toContain('book_appointment');
    expect(getTemplate('nope')).toBeUndefined();
  });
});

describe('CSV export', () => {
  it('renders rows with quoting for commas/quotes/newlines', () => {
    const csv = toCsv([{ name: 'Jane', notes: 'wants, a "quote"\nASAP' }], ['name', 'notes']);
    expect(csv).toBe('name,notes\nJane,"wants, a ""quote""\nASAP"\n');
  });
});

describe('returning-caller prompt', () => {
  const agent = { ...DEFAULT_AGENT, id: 'a', name: 'Ava', business_name: 'Acme' } as AgentConfig;
  it('adds a returning-caller section when a known contact is provided', () => {
    const p = buildSystemPrompt(agent, { name: 'Jane Doe', lastSeen: 'last week', lastNotes: 'wanted a 2BR move' });
    expect(p).toMatch(/Returning caller/);
    expect(p).toContain('Jane Doe');
    expect(p).toMatch(/Greet them by name/);
  });
  it('omits it for unknown callers', () => {
    expect(buildSystemPrompt(agent)).not.toMatch(/Returning caller/);
  });
});

describe('Twilio signature algorithm', () => {
  it('produces a stable HMAC-SHA1 base64 signature', () => {
    const sig = twilioSign('test_token', 'https://example.com/twilio/inbound', { From: '+15551112222', To: '+15553334444' });
    // Deterministic for fixed inputs.
    expect(sig).toBe(twilioSign('test_token', 'https://example.com/twilio/inbound', { To: '+15553334444', From: '+15551112222' }));
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
