// register-business — self-service company signup from landing/business.html.
//
// Creates a Supabase auth user (auto-confirmed, so they can sign in + prefill the
// B2B request form immediately) + a linked row in the existing `businesses` table
// (migration 043; auth_user_id + saved-default fields added in migration 061). The
// businesses row is what business.html prefills/writes back, and it shows up in the
// admin Business tab like any other org. Sends a branded confirmation email via
// Resend (mirrors submit-business-job). Rolls back the auth user on failure.
//
// Why service role? Writing `businesses` requires either admin (is_admin()) or the
// owner's own session (auth_user_id = auth.uid()), which doesn't exist yet at signup.
//
// Deploy (anon-callable, public form):
//   npx supabase functions deploy register-business --no-verify-jwt --project-ref joiukvttuamaanrgzfrz

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://fastfixwork.com', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const isValidPhone = (p: string) => p.replace(/\D/g, '').length === 10;
const isValidPassword = (p: string) =>
  p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);

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
    const rl = await svc.rpc('check_rate_limit', { p_bucket: 'register-business:ip', p_key: clientIp, p_max: 10, p_window_seconds: 3600 });
    if (!rl.error && rl.data === false) {
      return new Response(JSON.stringify({ error: 'Too many signups from this network. Please call 512-777-1628.' }), { status: 429, headers });
    }

    // ── Validate / normalize input ──────────────────────────────────────────
    const companyName = String(body.company_name || '').trim().slice(0, 160);
    const contactName = String(body.contact_name || '').trim().slice(0, 120);
    const phone = String(body.phone || '').trim().slice(0, 20);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
    const password = String(body.password || '');
    const defaultAddress = String(body.default_address || '').trim().slice(0, 300) || null;
    const defaultAccessNotes = String(body.default_access_notes || '').trim().slice(0, 1000) || null;
    const defaultStairs = !!body.default_stairs, defaultElevator = !!body.default_elevator, defaultLongWalk = !!body.default_long_walk;

    if (!companyName) return new Response(JSON.stringify({ error: 'Enter your company name.' }), { status: 400, headers });
    if (!contactName) return new Response(JSON.stringify({ error: 'Enter a contact name.' }), { status: 400, headers });
    if (!isValidPhone(phone)) return new Response(JSON.stringify({ error: 'Enter a valid 10-digit phone number.' }), { status: 400, headers });
    if (!isValidEmail(email)) return new Response(JSON.stringify({ error: 'Enter a valid email address.' }), { status: 400, headers });
    if (!isValidPassword(password)) return new Response(JSON.stringify({ error: 'Password must be 8+ characters with upper, lower, number, and symbol.' }), { status: 400, headers });

    // ── Create the auth user (auto-confirmed → can sign in + prefill right away) ─
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: contactName, business_name: companyName, role: 'business' },
    });
    if (createErr || !created?.user) {
      const msg = (createErr?.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        return new Response(JSON.stringify({ error: 'An account with this email already exists. Try signing in instead.' }), { status: 409, headers });
      }
      console.error('createUser failed:', createErr?.message);
      return new Response(JSON.stringify({ error: 'Could not create the account. Please try again.' }), { status: 500, headers });
    }
    const userId = created.user.id;

    // ── Create the linked businesses row (saved profile the form prefills) ──────
    const { data: biz, error: bizErr } = await svc.from('businesses').insert({
      name: companyName,
      contact_name: contactName,
      contact_email: email,
      contact_phone: phone,
      auth_user_id: userId,
      default_address: defaultAddress,
      default_access_notes: defaultAccessNotes,
      default_stairs: defaultStairs,
      default_elevator: defaultElevator,
      default_long_walk: defaultLongWalk,
    }).select('id').single();
    if (bizErr || !biz) {
      console.error('businesses insert failed:', bizErr?.message);
      await svc.auth.admin.deleteUser(userId).catch(() => {}); // roll back the orphaned auth user
      return new Response(JSON.stringify({ error: 'Could not create your business profile. Please try again.' }), { status: 500, headers });
    }

    // ── Confirmation email (Resend) ─────────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Fast Fix Work <noreply@fastfixwork.com>',
          to: [email, 'fastfixworkservices@gmail.com'],
          subject: 'Your Fast Fix Work business account is ready',
          html: `<div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
            <div style="text-align:center;margin-bottom:24px;"><span style="font-size:28px;font-weight:800;color:#C98B3F;font-family:Georgia,serif;">Fast Fix Work</span></div>
            <h2 style="color:#1A1714;margin-bottom:4px;">Welcome, ${escHtml(contactName)}!</h2>
            <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:16px;">Your business account for <b>${escHtml(companyName)}</b> is all set. Sign in any time at <a href="https://fastfixwork.com/business" style="color:#C98B3F;font-weight:600;">fastfixwork.com/business</a> and your contact info, address, and access details will be filled in automatically — so booking a crew takes seconds.</p>
            <div style="background:#FAF7F2;border:1.5px solid #E8E0D4;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
              <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#888;">Company</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escHtml(companyName)}</td></tr>
                <tr><td style="padding:4px 0;color:#888;">Contact</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escHtml(contactName)}</td></tr>
                <tr><td style="padding:4px 0;color:#888;">Email</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escHtml(email)}</td></tr>
              </table>
            </div>
            <p style="color:#555;font-size:14px;line-height:1.6;">Questions? Call or text <a href="tel:5127771628" style="color:#C98B3F;font-weight:600;">512-777-1628</a>.</p>
            <p style="color:#aaa;font-size:12px;text-align:center;margin-top:20px;">Fast Fix Work LLC · Austin, TX</p>
          </div>`,
        }),
      }).catch((e) => console.error('confirmation email failed:', e));
    }

    console.log(`register-business: created business ${biz.id} for auth user ${userId} (${email})`);
    return new Response(JSON.stringify({ ok: true, user_id: userId, business_id: biz.id }), { status: 200, headers });
  } catch (err) {
    console.error('register-business error:', err);
    return new Response(JSON.stringify({ error: 'Could not complete signup. Please try again.' }), { status: 500, headers });
  }
});
