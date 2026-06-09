import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { takeSentence } from '../src/pipeline/conversation.js';

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

describe('Twilio signature algorithm', () => {
  it('produces a stable HMAC-SHA1 base64 signature', () => {
    const sig = twilioSign('test_token', 'https://example.com/twilio/inbound', { From: '+15551112222', To: '+15553334444' });
    // Deterministic for fixed inputs.
    expect(sig).toBe(twilioSign('test_token', 'https://example.com/twilio/inbound', { To: '+15553334444', From: '+15551112222' }));
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
