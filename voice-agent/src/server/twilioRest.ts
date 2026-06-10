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

/** Start recording a live call. Twilio POSTs the finished RecordingUrl to our callback. */
export async function startRecording(callSid: string): Promise<boolean> {
  if (!config.twilio.accountSid || !config.publicBaseUrl) return false;
  try {
    const res = await fetch(`${base()}/Calls/${callSid}/Recordings.json`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        RecordingStatusCallback: `${config.publicBaseUrl}/twilio/recording-status`,
        RecordingStatusCallbackEvent: 'completed',
      }),
    });
    if (!res.ok) log.warn(`startRecording -> HTTP ${res.status}`, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    log.error('startRecording failed', e);
    return false;
  }
}

/** Fetch a Twilio recording (mp3) with auth — used to proxy playback to the dashboard. */
export async function fetchRecording(recordingUrl: string): Promise<Response | null> {
  if (!config.twilio.accountSid) return null;
  const mp3 = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;
  try {
    const res = await fetch(mp3, { headers: { Authorization: authHeader() } });
    return res.ok ? res : null;
  } catch (e) {
    log.error('fetchRecording failed', e);
    return null;
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

/** Search Twilio for purchasable local numbers (optionally by area code). */
export async function searchAvailableNumbers(areaCode?: string, country = 'US'): Promise<{ phoneNumber: string; locality?: string; region?: string }[]> {
  if (!config.twilio.accountSid) return [];
  const params = new URLSearchParams({ SmsEnabled: 'true', VoiceEnabled: 'true', PageSize: '10' });
  if (areaCode) params.set('AreaCode', areaCode);
  try {
    const res = await fetch(`${base()}/AvailablePhoneNumbers/${country}/Local.json?${params}`, { headers: { Authorization: authHeader() } });
    if (!res.ok) {
      log.warn(`searchNumbers HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as any;
    return (data.available_phone_numbers ?? []).map((n: any) => ({ phoneNumber: n.phone_number, locality: n.locality, region: n.region }));
  } catch (e) {
    log.error('searchNumbers failed', e);
    return [];
  }
}

/** Buy a number and point its voice + SMS webhooks at this server. */
export async function buyNumber(phoneNumber: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!config.twilio.accountSid) return { ok: false, error: 'Twilio not configured' };
  if (!config.publicBaseUrl) return { ok: false, error: 'PUBLIC_BASE_URL not set' };
  try {
    const res = await fetch(`${base()}/IncomingPhoneNumbers.json`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        PhoneNumber: phoneNumber,
        VoiceUrl: `${config.publicBaseUrl}/twilio/inbound`,
        VoiceMethod: 'POST',
        SmsUrl: `${config.publicBaseUrl}/twilio/sms`,
        SmsMethod: 'POST',
        StatusCallback: `${config.publicBaseUrl}/twilio/status`,
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` };
    return { ok: true, sid: data.sid };
  } catch (e: any) {
    log.error('buyNumber failed', e);
    return { ok: false, error: String(e?.message || e) };
  }
}
