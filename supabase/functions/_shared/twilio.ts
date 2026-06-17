// Shared Twilio SMS sender.
//
// Used by:
//   - notify-intake-received  → "we got your request" text (send #1)
//   - stripe-webhook          → "booking confirmed" text   (send #2)
//
// Fail-soft by design: any misconfiguration or send error is logged and returns
// false so a texting problem NEVER blocks the booking / payment flow. Edge-fn →
// edge-fn HTTP calls are unreliable here, so this is a plain module both
// functions import directly (the Supabase CLI bundles _shared/).
//
// Env (set as Supabase function secrets):
//   TWILIO_ACCOUNT_SID            (required)
//   TWILIO_AUTH_TOKEN             (required)
//   TWILIO_MESSAGING_SERVICE_SID  (preferred sender — handles number pool + STOP/HELP)
//   TWILIO_FROM                   (fallback sender — a single +1 Twilio number)
// Provide EITHER TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM.

// Normalize a user-entered US phone to E.164 (+1XXXXXXXXXX). Returns null when it
// doesn't look like a dialable US number (so we skip the send rather than error).
export function toE164US(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  }
  const d = trimmed.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  return null;
}

export interface SmsResult {
  ok: boolean;
  error?: string; // short reason — Twilio error text, "not_configured", or "invalid_phone"
  sid?: string;   // Twilio message SID on success
}

// Send one SMS. ok=true only on a 2xx from Twilio (message accepted/queued).
// Note: a 2xx means Twilio ACCEPTED the message — final delivery (and errors like
// 30034 unregistered-A2P) is asynchronous and only visible in the Twilio console.
export async function sendSms(to: string | null | undefined, body: string): Promise<SmsResult> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const from = Deno.env.get('TWILIO_FROM');

  if (!sid || !token || (!messagingServiceSid && !from)) {
    console.warn(
      'Twilio not configured — skipping SMS (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ' +
      'and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM)',
    );
    return { ok: false, error: 'not_configured' };
  }

  const e164 = toE164US(to);
  if (!e164) {
    console.warn('SMS skipped — phone is not a valid US number:', to);
    return { ok: false, error: `invalid_phone:${to}` };
  }

  const params = new URLSearchParams();
  params.set('To', e164);
  params.set('Body', body);
  if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
  else params.set('From', from!);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${sid}:${token}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error('Twilio send failed', res.status, text);
      return { ok: false, error: `${res.status}: ${text}`.slice(0, 400) };
    }
    let messageSid: string | undefined;
    try { messageSid = JSON.parse(text).sid; } catch { /* ignore */ }
    return { ok: true, sid: messageSid };
  } catch (e) {
    console.error('Twilio send error', e);
    return { ok: false, error: String(e).slice(0, 400) };
  }
}
