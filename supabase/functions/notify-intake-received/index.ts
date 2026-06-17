// Supabase Edge Function — sends the "we got your request" confirmation the
// moment a customer enters their contact info on the intake form (send #1).
//
// Called by landing/intake.html right after the contact step is saved. Sends:
//   • an email via Resend (to the customer + the business inbox)
//   • an SMS via Twilio — ONLY if the customer ticked the consent checkbox
//
// Idempotent: the intake form's autosave can fire on every step advance, so this
// atomically "claims" the lead by stamping intake_ack_sent_at only when it's
// still null. If another call already claimed it, we no-op. No auth (public
// intake form) — deploy WITH --no-verify-jwt. Rate-limited per IP + per lead.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendSms } from '../_shared/twilio.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGINS = [
  'https://fastfixwork.com',
  'https://www.fastfixwork.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const SUPPORT_PHONE = '512-777-1628';
const BUSINESS_EMAIL = 'fastfixworkservices@gmail.com';

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

function buildEmailHtml(firstName: string, refNum: string, q: any): string {
  const row = (label: string, val: string | null | undefined) => val
    ? `<tr><td style="padding:4px 0;color:#888;">${esc(label)}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${esc(val)}</td></tr>`
    : '';
  return `
    <div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:28px;font-weight:800;color:#C98B3F;font-family:'Georgia',serif;">Fast Fix Work</span>
      </div>
      <h2 style="color:#1A1714;margin-bottom:4px;">Hey ${esc(firstName)}, we've got your request!</h2>
      <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:20px;">
        Thanks for reaching out. We've received your moving details and a team member will be in touch shortly to confirm everything and lock in your crew.
      </p>
      <div style="background:#FAF7F2;border:1.5px solid #E8E0D4;border-radius:12px;padding:20px;margin-bottom:20px;">
        ${refNum ? `<div style="font-size:13px;color:#C98B3F;font-weight:700;margin-bottom:12px;">Reference ${esc(refNum)}</div>` : ''}
        <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
          ${row('Service', q.service_type)}
          ${row('Move size', q.items_size)}
          ${row('Date', q.preferred_date)}
          ${row('Time', q.preferred_time)}
          ${row('Pickup', q.pickup_address)}
          ${row('Drop-off', q.dropoff_address)}
        </table>
      </div>
      <p style="color:#555;font-size:14px;line-height:1.6;margin-bottom:8px;">
        <strong>What happens next:</strong> We'll review your move and reach out by phone or text to finalize the details. If you didn't finish the form, you can pick up right where you left off.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="tel:5127771628" style="display:inline-block;background:#C98B3F;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Call or text: ${esc(SUPPORT_PHONE)}</a>
      </div>
      <p style="color:#aaa;font-size:12px;text-align:center;">
        Fast Fix Work LLC · Austin, TX · Mon–Sat, 7 AM – 9 PM<br>
        <a href="mailto:communication@fastfixwork.com" style="color:#C98B3F;">communication@fastfixwork.com</a>
      </p>
    </div>`;
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://fastfixwork.com';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    const { quote_request_id } = await req.json();
    if (!quote_request_id) {
      return new Response(JSON.stringify({ error: 'quote_request_id required' }), { status: 400, headers });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limit (fails open if the limiter RPC itself is unavailable). Trust only
    // proxy-set IP headers — the leftmost X-Forwarded-For value is spoofable.
    const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean).pop();
    const clientIp = req.headers.get('cf-connecting-ip') || xff || 'unknown';
    const rlChecks = await Promise.all([
      supabase.rpc('check_rate_limit', { p_bucket: 'notify-intake:ip', p_key: clientIp, p_max: 20, p_window_seconds: 3600 }),
      supabase.rpc('check_rate_limit', { p_bucket: 'notify-intake:quote', p_key: quote_request_id, p_max: 3, p_window_seconds: 3600 }),
    ]);
    const rlError = rlChecks.find((r) => r.error)?.error;
    const rlBlocked = rlChecks.some((r) => r.data === false);
    if (rlError) {
      console.warn('Rate limiter unavailable, allowing request:', rlError.message);
    } else if (rlBlocked) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers });
    }

    // Atomically claim the lead: stamp intake_ack_sent_at only if it's still null.
    // If 0 rows come back, a prior call already sent the ack → no-op (dedupe).
    const { data: claimed, error: claimErr } = await supabase
      .from('quote_requests')
      .update({ intake_ack_sent_at: new Date().toISOString() })
      .eq('id', quote_request_id)
      .is('intake_ack_sent_at', null)
      .select('id, name, email, phone, lead_number, service_type, items_size, preferred_date, preferred_time, pickup_address, dropoff_address, sms_consent');

    if (claimErr) {
      console.error('Claim update failed:', claimErr.message);
      return new Response(JSON.stringify({ error: 'lookup failed' }), { status: 500, headers });
    }
    if (!claimed || claimed.length === 0) {
      // Either the lead doesn't exist or the ack was already sent — both no-op.
      return new Response(JSON.stringify({ status: 'already_sent' }), { status: 200, headers });
    }

    const quote = claimed[0];
    const firstName = quote.name?.split(' ')[0] || 'there';
    const refNum = quote.lead_number ? `#${quote.lead_number}` : '';

    let emailSent = false;
    let smsSent = false;

    // ── Email via Resend ──
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey && quote.email) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'Fast Fix Work <noreply@fastfixwork.com>',
            to: [quote.email, BUSINESS_EMAIL],
            subject: `We got your request${refNum ? ' ' + refNum : ''} — Fast Fix Work`,
            html: buildEmailHtml(firstName, refNum, quote),
          }),
        });
        emailSent = res.ok;
        if (!res.ok) console.error('Resend failed', res.status, await res.text());
      } catch (e) {
        console.error('Resend error', e);
      }
    }

    // ── SMS via Twilio (consent required) ──
    let smsError: string | undefined;
    if (quote.sms_consent && quote.phone) {
      const r = await sendSms(
        quote.phone,
        `Fast Fix Work: Hi ${firstName}, we got your moving request${refNum ? ' ' + refNum : ''}! ` +
        `We'll reach out shortly to confirm. Call/text ${SUPPORT_PHONE}. Reply STOP to opt out, HELP for help.`,
      );
      smsSent = r.ok;
      smsError = r.error;
    }

    console.log(`Intake ack for ${quote_request_id}: email=${emailSent} sms=${smsSent}${smsError ? ' smsError=' + smsError : ''}`);
    return new Response(JSON.stringify({ status: 'sent', email: emailSent, sms: smsSent, smsError }), { status: 200, headers });
  } catch (err) {
    console.error('notify-intake-received error:', err);
    return new Response(JSON.stringify({ error: 'unexpected error' }), { status: 500, headers });
  }
});
