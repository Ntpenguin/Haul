// create-surcharge — admin-initiated extra charge against an existing gig.
//
// The customer pays via an emailed Stripe Checkout link (no stored card). Flow:
//   admin dashboard -> this fn (verifies is_admin) -> Stripe Checkout Session
//   -> Resend email with the pay link -> customer pays -> stripe-webhook stamps
//      the surcharge row 'paid' (PaymentIntent metadata.type = 'surcharge').
//
// Deploy WITHOUT --no-verify-jwt (needs the admin's JWT to authorize):
//   npx supabase functions deploy create-surcharge --project-ref joiukvttuamaanrgzfrz
//
// Uses auto-injected secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// STRIPE_SECRET_KEY, RESEND_API_KEY.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

const ALLOWED_ORIGINS = [
  'https://fastfixwork.com',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

// Sanity cap so a typo can't bill someone thousands. $5,000 max per surcharge.
const MAX_SURCHARGE_CENTS = 500000;

// HTML-escape any DB/request-derived value before placing it in the email body
// (customer name, reason, addresses are user-controlled — prevent markup injection).
const escHtml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
    // ── Authorize: caller must be an admin ──────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

    const authed = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    const { data: isAdmin, error: adminErr } = await authed.rpc('is_admin');
    if (adminErr || isAdmin !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });
    }

    // ── Validate input ──────────────────────────────────────────────────────
    const { gig_id, amount_cents, reason } = await req.json();
    if (!gig_id) return new Response(JSON.stringify({ error: 'gig_id required' }), { status: 400, headers });
    const amount = Math.round(Number(amount_cents));
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'A positive amount is required' }), { status: 400, headers });
    }
    if (amount > MAX_SURCHARGE_CENTS) {
      return new Response(JSON.stringify({ error: 'Amount exceeds the $5,000 per-charge limit' }), { status: 400, headers });
    }
    const reasonText = (typeof reason === 'string' ? reason : '').trim().slice(0, 300);

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Load gig + resolve customer email/name ─────────────────────────────
    const { data: gig, error: gigErr } = await svc
      .from('gigs')
      .select('id, customer_id, quote_request_id, from_address, to_address, gig_title, status')
      .eq('id', gig_id)
      .single();
    if (gigErr || !gig) return new Response(JSON.stringify({ error: 'Gig not found' }), { status: 404, headers });

    let email: string | null = null;
    let name = 'there';
    if (gig.customer_id) {
      const { data: p } = await svc.from('profiles').select('email, full_name').eq('id', gig.customer_id).single();
      email = p?.email ?? null;
      if (p?.full_name) name = p.full_name.split(' ')[0];
    } else if (gig.quote_request_id) {
      const { data: q } = await svc.from('quote_requests').select('email, name').eq('id', gig.quote_request_id).single();
      email = q?.email ?? null;
      if (q?.name) name = q.name.split(' ')[0];
    }
    // Business-job gigs have no customer_id/quote_request_id — resolve from business_jobs.
    if (!email) {
      const { data: bj } = await svc.from('business_jobs').select('customer_email, customer_name').eq('gig_id', gig.id).maybeSingle();
      email = bj?.customer_email ?? null;
      if (bj?.customer_name) name = bj.customer_name.split(' ')[0];
    }
    if (!email) {
      return new Response(JSON.stringify({ error: 'No customer email on file for this gig' }), { status: 400, headers });
    }

    // ── Record the pending surcharge (gets the id we tag onto the PaymentIntent) ──
    const { data: row, error: insErr } = await svc
      .from('surcharges')
      .insert({
        gig_id: gig.id,
        amount_cents: amount,
        reason: reasonText || null,
        status: 'pending',
        customer_email: email,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (insErr || !row) {
      console.error('surcharge insert failed:', insErr?.message);
      return new Response(JSON.stringify({ error: 'Could not create surcharge' }), { status: 500, headers });
    }

    // ── Create a hosted Checkout link the customer can pay ──────────────────
    const gigLabel = gig.gig_title || 'your move';
    const meta = { type: 'surcharge', surcharge_id: row.id, gig_id: gig.id };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: `Additional charge — ${gigLabel}`,
            description: reasonText || 'On-site scope adjustment',
          },
        },
      }],
      payment_intent_data: { metadata: meta },
      metadata: meta,
      success_url: 'https://fastfixwork.com/surcharge-paid.html',
      cancel_url: 'https://fastfixwork.com/',
    });

    await svc.from('surcharges').update({ stripe_checkout_session_id: session.id }).eq('id', row.id);

    // ── Email the pay link (customer + business CC) ─────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey && session.url) {
      const amountStr = `$${(amount / 100).toFixed(2)}`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Fast Fix Work <noreply@fastfixwork.com>',
          to: [email, 'fastfixworkservices@gmail.com', 'fastfixappsupport@gmail.com'],
          subject: `Additional charge for your move — Fast Fix Work`,
          html: `
            <div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:28px;font-weight:800;color:#C98B3F;font-family:'Georgia',serif;">Fast Fix Work</span>
              </div>
              <h2 style="color:#1A1714;margin-bottom:4px;">Hi ${escHtml(name)}, there's an update to your move</h2>
              <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:16px;">
                After reviewing your job on site, there's an additional charge of
                <strong>${amountStr}</strong>${reasonText ? ` for: <em>${escHtml(reasonText)}</em>` : ''}.
                You can pay it securely with the button below.
              </p>
              <div style="background:#FAF7F2;border:1.5px solid #E8E0D4;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
                <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
                  ${gig.from_address ? `<tr><td style="padding:4px 0;color:#888;">Pickup</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escHtml(gig.from_address)}</td></tr>` : ''}
                  ${gig.to_address ? `<tr><td style="padding:4px 0;color:#888;">Drop-off</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escHtml(gig.to_address)}</td></tr>` : ''}
                  <tr><td style="padding:8px 0 4px;color:#888;border-top:1px solid #E8E0D4;">Amount due</td><td style="padding:8px 0 4px;text-align:right;font-weight:800;font-size:16px;color:#1A1714;border-top:1px solid #E8E0D4;">${amountStr}</td></tr>
                </table>
              </div>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${session.url}" style="display:inline-block;background:#C98B3F;color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Pay ${amountStr} now</a>
              </div>
              <p style="color:#888;font-size:13px;line-height:1.6;margin-bottom:24px;">
                Questions about this charge? Call or text <a href="tel:5127771628" style="color:#C98B3F;font-weight:600;">512-777-1628</a> before paying.
              </p>
              <p style="color:#aaa;font-size:12px;text-align:center;">
                Fast Fix Work LLC · Austin, TX<br>
                <a href="mailto:communication@fastfixwork.com" style="color:#C98B3F;">communication@fastfixwork.com</a>
              </p>
            </div>
          `,
        }),
      });
    }

    return new Response(JSON.stringify({ url: session.url, surcharge_id: row.id }), { status: 200, headers });
  } catch (err) {
    console.error('create-surcharge error:', err);
    return new Response(JSON.stringify({ error: 'Could not create surcharge' }), { status: 500, headers });
  }
});
