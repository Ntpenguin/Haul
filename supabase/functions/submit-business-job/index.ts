// submit-business-job — B2B intake recorder (anon-callable, no account).
//
// Plain request form: it validates + stores the request and emails a confirmation.
// NO pricing, NO offer, NO accept/counter/book decision — the admin reviews and
// schedules every job from the Business Jobs tab. (Pricing/booking now lives only
// in the admin "Book" flow via bill-business-job.)
//
// Deploy WITHOUT --no-verify-jwt note — this IS a public form, so deploy with it:
//   npx supabase functions deploy submit-business-job --no-verify-jwt --project-ref joiukvttuamaanrgzfrz

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://fastfixwork.com', 'http://localhost:3000', 'http://127.0.0.1:3000'];

// Accepted size tiers (kept in sync with landing/business.html SIZES + intake).
const VALID_SIZES = new Set([
  'Single item', 'Just a few items', 'Small move', 'Studio', '1 BR', '2 BR', '3 BR', '4+ BR / full house',
]);

// HTML-escape user-controlled values placed into the confirmation email.
const escHtml = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://fastfixwork.com';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  try {
    const body = await req.json();
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Rate-limit per IP (fail open if the limiter RPC is unavailable).
    const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean).pop();
    const clientIp = req.headers.get('cf-connecting-ip') || xff || 'unknown';
    const rl = await svc.rpc('check_rate_limit', { p_bucket: 'submit-business-job:ip', p_key: clientIp, p_max: 20, p_window_seconds: 3600 });
    if (!rl.error && rl.data === false) {
      return new Response(JSON.stringify({ error: 'Too many submissions. Please call 512-777-1628.' }), { status: 429, headers });
    }

    // ── Validate / normalize input ──────────────────────────────────────────
    const name = String(body.customer_name || '').trim().slice(0, 120);
    const phone = String(body.customer_phone || '').trim().slice(0, 20);
    const jobSize = VALID_SIZES.has(body.job_size) ? body.job_size : null;
    const stops = (Array.isArray(body.stops) ? body.stops.slice(0, 4) : [])
      .filter((s: any) => s && s.addr)
      .map((s: any) => ({
        addr: String(s.addr).slice(0, 300),
        apt: s.apt ? String(s.apt).slice(0, 40) : null,
        lat: typeof s.lat === 'number' ? s.lat : null,
        lng: typeof s.lng === 'number' ? s.lng : null,
      }));
    if (!name || !phone) return new Response(JSON.stringify({ error: 'Name and phone are required' }), { status: 400, headers });
    if (!jobSize) return new Response(JSON.stringify({ error: 'Pick a job size' }), { status: 400, headers });
    if (stops.length < 1) return new Response(JSON.stringify({ error: 'At least one address is required' }), { status: 400, headers });

    const stairs = !!body.stairs, elevator = !!body.elevator, longWalk = !!body.long_walk;
    const reqDate = /^\d{4}-\d{2}-\d{2}$/.test(body.requested_date || '') ? body.requested_date : null;
    const reqTime = String(body.requested_time || '').slice(0, 40) || null; // free-text 2-hour window

    // ── Store the request (record-only — no price, no decision) ─────────────
    const { data: row, error: insErr } = await svc.from('business_jobs').insert({
      customer_name: name, customer_phone: phone, customer_email: body.customer_email || null,
      photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls.slice(0, 12) : [],
      stops, job_size: jobSize, stairs, elevator, long_walk: longWalk,
      access_notes: String(body.access_notes || '').slice(0, 1000) || null,
      requested_date: reqDate, requested_time: reqTime,
      status: 'new', notes: String(body.notes || '').slice(0, 2000) || null,
    }).select('id, job_number').single();
    if (insErr || !row) {
      console.error('business_jobs insert failed:', insErr?.message);
      return new Response(JSON.stringify({ error: 'Could not submit job' }), { status: 500, headers });
    }

    // ── Confirmation email — business contact + the FFW inboxes ─────────────
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      const recipients = ['fastfixworkservices@gmail.com', 'fastfixappsupport@gmail.com'];
      const custEmail = String(body.customer_email || '').trim();
      if (custEmail) recipients.unshift(custEmail);
      const routeHtml = stops.map((s: any, i: number) => `${i + 1}. ${escHtml(s.addr)}${s.apt ? ' (Apt ' + escHtml(s.apt) + ')' : ''}`).join('<br>') || '—';
      const when = [reqDate, reqTime].filter(Boolean).join(' · ') || 'Flexible';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Fast Fix Work <noreply@fastfixwork.com>',
          to: recipients,
          subject: `Business job #${row.job_number} received — Fast Fix Work`,
          html: `<div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
            <div style="text-align:center;margin-bottom:24px;"><span style="font-size:28px;font-weight:800;color:#C98B3F;font-family:Georgia,serif;">Fast Fix Work</span></div>
            <h2 style="color:#1A1714;margin-bottom:4px;">Hi ${escHtml(name)}, we got your request</h2>
            <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:16px;">Thanks for the details — our team will review and reach out to confirm pricing, crew, and a time that works.</p>
            <div style="background:#FAF7F2;border:1.5px solid #E8E0D4;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
              <div style="font-size:13px;color:#C98B3F;font-weight:700;margin-bottom:10px;">Job #${row.job_number}</div>
              <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#888;">Job size</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escHtml(jobSize)}</td></tr>
                <tr><td style="padding:4px 0;color:#888;vertical-align:top;">Route</td><td style="padding:4px 0;text-align:right;font-weight:600;">${routeHtml}</td></tr>
                <tr><td style="padding:4px 0;color:#888;">Preferred</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escHtml(when)}</td></tr>
              </table>
            </div>
            <p style="color:#555;font-size:14px;line-height:1.6;">Questions? Call or text <a href="tel:5127771628" style="color:#C98B3F;font-weight:600;">512-777-1628</a>.</p>
            <p style="color:#aaa;font-size:12px;text-align:center;margin-top:20px;">Fast Fix Work LLC · Austin, TX</p>
          </div>`,
        }),
      });
      console.log(`Business job #${row.job_number} email sent to ${recipients.join(', ')}`);
    }

    return new Response(JSON.stringify({ job_number: row.job_number, status: 'received' }), { status: 200, headers });
  } catch (err) {
    console.error('submit-business-job error:', err);
    return new Response(JSON.stringify({ error: 'Could not submit job' }), { status: 500, headers });
  }
});
