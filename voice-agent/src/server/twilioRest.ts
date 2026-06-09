import { config } from '../config.js';
import { logger } from '../logger.js';

const log = logger('twilio');

const base = () => `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}`;
const authHeader = () =>
  'Basic ' + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');

/** Update a live call with new TwiML (used for transfer + hangup). */
export async function updateCallTwiml(callSid: string, twiml: string): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/Calls/${callSid}.json`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ Twiml: twiml }),
    });
    if (!res.ok) log.warn(`updateCall ${callSid} -> HTTP ${res.status}`, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    log.error('updateCall failed', e);
    return false;
  }
}

export function transferTwiml(number: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${number}</Dial></Response>`;
}
export function hangupTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
}

/** Place an outbound call that connects to our media stream. */
export async function placeOutboundCall(to: string, twimlUrl: string): Promise<{ sid?: string; ok: boolean }> {
  try {
    const res = await fetch(`${base()}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: config.twilio.fromNumber, Url: twimlUrl }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      log.warn('placeCall failed', data);
      return { ok: false };
    }
    return { ok: true, sid: data.sid };
  } catch (e) {
    log.error('placeCall failed', e);
    return { ok: false };
  }
}

/** Send an SMS via Twilio. No-ops (returns false) if Twilio or a from-number is missing. */
export async function sendSms(to: string, body: string, from?: string): Promise<boolean> {
  if (!config.twilio.accountSid || !config.twilio.authToken) return false;
  const fromNumber = from || config.twilio.fromNumber;
  if (!fromNumber || !isE164(to)) return false;
  try {
    const res = await fetch(`${base()}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
    });
    if (!res.ok) log.warn(`sendSms -> HTTP ${res.status}`, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    log.error('sendSms failed', e);
    return false;
  }
}

/** Loose E.164 check (e.g. +15125551234) — guards against the simulator's fake numbers. */
export function isE164(s: string | undefined): boolean {
  return !!s && /^\+?[1-9]\d{7,14}$/.test(s.replace(/[\s()-]/g, ''));
}
