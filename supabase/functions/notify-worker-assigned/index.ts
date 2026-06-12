// notify-worker-assigned — email a worker that an admin assigned them to a gig.
//
// Called from the admin dashboard after BOTH assignment paths succeed:
//   1. gig-modal / Schedule crew picker (job_crew insert)        — assignCrew()
//   2. accepting a mover's application (assign_mover_to_gig RPC) — assignMover()
//
// Informational only: job, when, where, duration. Deliberately NO payout amount —
// for multi-crew jobs the gig's mover_payout_cents isn't one worker's pay, and
// crew payouts are logged manually in the Crew & pay tab.
//
// Deploy WITHOUT --no-verify-jwt (needs the admin's JWT to authorize):
//   npx supabase functions deploy notify-worker-assigned --project-ref joiukvttuamaanrgzfrz
//
// Uses auto-injected secrets: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://fastfixwork.com',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

// HTML-escape any DB-derived value before placing it in the email body
// (names, titles, addresses are user-controlled — prevent markup injection).
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
    const { gig_id, worker_id } = await req.json();
    if (!gig_id || !worker_id) {
      return new Response(JSON.stringify({ error: 'gig_id and worker_id required' }), { status: 400, headers });
    }

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Load the worker + the gig ───────────────────────────────────────────
    const { data: worker, error: wErr } = await svc
      .from('profiles')
      .select('email, full_name')
      .eq('id', worker_id)
      .single();
    if (wErr || !worker) return new Response(JSON.stringify({ error: 'Worker not found' }), { status: 404, headers });
    if (!worker.email) {
      return new Response(JSON.stringify({ error: 'This worker has no email on file' }), { status: 400, headers });
    }

    const { data: gig, error: gErr } = await svc
      .from('gigs')
      .select('id, gig_title, home_size, from_address, to_address, scheduled_for, estimated_duration_hours, difficulty, crew_size')
      .eq('id', gig_id)
      .single();
    if (gErr || !gig) return new Response(JSON.stringify({ error: 'Gig not found' }), { status: 404, headers });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return new Response(JSON.stringify({ error: 'Email is not configured' }), { status: 500, headers });

    const firstName = (worker.full_name || 'there').split(' ')[0];
    const jobLabel = gig.gig_title || (gig.home_size ? `${gig.home_size} move` : 'a move');
    const when = gig.scheduled_for
      ? new Date(gig.scheduled_for).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
        }) + ' (CT)'
      : 'Time to be confirmed — we’ll reach out';
    const duration = gig.estimated_duration_hours ? `~${gig.estimated_duration_hours} hours` : null;
    const row = (label: string, value: string | null) => value
      ? `<tr><td style="padding:5px 0;color:#84877E;vertical-align:top;">${label}</td><td style="padding:5px 0;text-align:right;font-weight:600;color:#21251F;">${value}</td></tr>`
      : '';

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Fast Fix Work <noreply@fastfixwork.com>',
        to: [worker.email, 'fastfixworkservices@gmail.com'],
        subject: `You're on a job — ${jobLabel} — Fast Fix Work`,
        html: `
          <div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
            <div style="text-align:center;margin-bottom:24px;">
              <span style="font-size:28px;font-weight:800;color:#C9A23C;font-family:'Georgia',serif;">Fast Fix Work</span>
            </div>
            <h2 style="color:#21251F;margin-bottom:4px;">${escHtml(firstName)}, you've been assigned to a job</h2>
            <p style="color:#4D5149;font-size:15px;line-height:1.6;margin-bottom:16px;">
              You're on the crew for <strong>${escHtml(jobLabel)}</strong>. Details below — open the
              Fast Fix Work app for the full checklist and to message about the job.
            </p>
            <div style="background:#FAF7EC;border:1.5px solid #E2C96B;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
              <table style="width:100%;font-size:14px;border-collapse:collapse;">
                ${row('When', escHtml(when))}
                ${row('Pickup', gig.from_address ? escHtml(gig.from_address) : null)}
                ${row('Drop-off', gig.to_address ? escHtml(gig.to_address) : null)}
                ${row('Est. duration', duration ? escHtml(duration) : null)}
                ${row('Crew size', gig.crew_size ? escHtml(String(gig.crew_size)) : null)}
              </table>
            </div>
            <p style="color:#4D5149;font-size:14px;line-height:1.6;margin-bottom:24px;">
              Can't make it, or have a question? Call or text
              <a href="tel:5127771628" style="color:#7E6418;font-weight:700;">512-777-1628</a> as soon as possible.
            </p>
            <p style="color:#84877E;font-size:12px;text-align:center;">
              Fast Fix Work LLC · Austin, TX<br>
              <a href="mailto:communication@fastfixwork.com" style="color:#7E6418;">communication@fastfixwork.com</a>
            </p>
          </div>
        `,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('Resend failed:', resp.status, body);
      return new Response(JSON.stringify({ error: 'Email send failed' }), { status: 502, headers });
    }

    console.log(`notify-worker-assigned: emailed ${worker.email} for gig ${gig.id}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('notify-worker-assigned error:', err);
    return new Response(JSON.stringify({ error: 'Could not send notification' }), { status: 500, headers });
  }
});
