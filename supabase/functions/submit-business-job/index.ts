// submit-business-job — B2B intake decision engine (anon-callable, no account).
//
// Server-authoritative: recomputes the recommended price (base by job size +
// multi-stop distance + access surcharges), estimates duration, checks OUR
// calendar (get_booked_slots + booked business jobs), then decides:
//   accepted  — offer >= 80% of recommended, fits in <=4h, slot free -> books a gig
//   countered — offer too low (counter = recommended) OR slot taken (counter a slot)
//   pending   — estimated > 4h (manual review)
//
// Deploy WITHOUT --no-verify-jwt (public form):
//   npx supabase functions deploy submit-business-job --no-verify-jwt --project-ref joiukvttuamaanrgzfrz

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';
import { billBusinessJob } from '../_shared/bizbill.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const ALLOWED_ORIGINS = ['https://fastfixwork.com', 'http://localhost:3000', 'http://127.0.0.1:3000'];

// Pricing — mirrors landing/intake.html + create-quote-payment.
const BASE_PRICES: Record<string, number> = {
  'Single item': 9375, 'Just a few items': 17500, 'Studio': 35000, '1 BR': 50000,
  '2 BR': 80000, '3 BR': 135000, '4+ BR / full house': 160000,
};
const ESTIMATED_HOURS: Record<string, number> = {
  'Single item': 1, 'Just a few items': 1.5, 'Studio': 2, '1 BR': 3, '2 BR': 4, '3 BR': 5, '4+ BR / full house': 7,
};
const STAIRS_SURCHARGE = 5000;     // $50 flat (simpler than per-flight on the B2B form)
const ELEVATOR_SURCHARGE = 4000;   // $40
const LONG_WALK_SURCHARGE = 5000;  // $50
const HEAVY_PRICES: Record<string, number> = {
  'Piano': 25000, 'Safe / gun safe': 15000, 'Pool table': 30000, 'Refrigerator': 12000,
  'Refrigerator disassembly': 8000,
  'Treadmill / Peloton': 7500, 'Big TV (65"+)': 7500, 'Aquarium': 7500, 'Artwork / mirror': 7500,
};
const TAX = 0.0825;
const DISTANCE_FREE_MILES = 15;
const DISTANCE_PER_MILE = 125;
const DRIVE_MPH = 45;
const ACCEPT_RATIO = 0.80;         // accept if offer >= 80% of recommended
const MAX_HOURS_AUTO = 4;          // > 4h -> pending
const PLATFORM_FEE_PERCENT = 15;
const DAY_START = 8, DAY_END = 19; // 8 AM–7 PM slot grid for counter suggestions

// HTML-escape user-controlled values placed into the confirmation email.
const escHtml = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Total distance across the stops, in order.
function multiStopMiles(stops: any[]): number {
  let total = 0;
  const pts = (stops || []).filter((s) => s && s.lat != null && s.lng != null);
  for (let i = 0; i < pts.length - 1; i++) {
    total += haversineMiles(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
  }
  return Math.round(total);
}

function to12h(hour24: number): string {
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  let h = hour24 % 12; if (h === 0) h = 12;
  return `${h}:00 ${ampm}`;
}

// "3:00 PM" -> 15
function parseHourLabel(label?: string | null): number | null {
  const m = String(label || '').match(/^(\d{1,2}):00\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (/pm/i.test(m[2]) && h < 12) h += 12;
  if (/am/i.test(m[2]) && h === 12) h = 0;
  return h;
}

// Estimated hours an EXISTING booking occupies (size + access). Mirrors the intake
// form's estimateLeadHours so both forms block the same spans.
function estBookedHours(row: any): number {
  let hrs = ESTIMATED_HOURS[row.items_size] || 2;
  if (String(row.stairs_pickup || '').includes('Stairs')) hrs += 0.5;
  if (String(row.stairs_dropoff || '').includes('Stairs')) hrs += 0.5;
  const sc = Array.isArray(row.special_items) ? row.special_items.length : 0;
  hrs += sc * 0.25;
  if (String(row.parking || '').includes('100+')) hrs += 0.25;
  return Math.ceil(hrs * 2) / 2;
}

// Central-time 'YYYY-MM-DD' + 'H:00 AM/PM' -> UTC ISO (mirrors stripe-webhook).
function buildScheduledFor(dateStr?: string | null, timeStr?: string | null): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  let hour = 9;
  const m = (timeStr || '').match(/^(\d{1,2}):00\s*(AM|PM)$/i);
  if (m) {
    hour = parseInt(m[1], 10);
    if (m[2].toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (m[2].toUpperCase() === 'AM' && hour === 12) hour = 0;
  }
  const hh = String(hour).padStart(2, '0');
  try {
    const probe = new Date(`${dateStr}T${hh}:00:00Z`);
    const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'short' })
      .formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value;
    const offset = tz === 'CDT' ? '05' : '06';
    return new Date(`${dateStr}T${hh}:00:00-${offset}:00`).toISOString();
  } catch { return null; }
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
    const jobSize = BASE_PRICES[body.job_size] != null ? body.job_size : null;
    const stops = Array.isArray(body.stops) ? body.stops.slice(0, 4) : [];
    const offered = Math.max(0, Math.round(Number(body.offered_price_cents) || 0));
    if (!name || !phone) return new Response(JSON.stringify({ error: 'Name and phone are required' }), { status: 400, headers });
    if (!jobSize) return new Response(JSON.stringify({ error: 'Pick a job size' }), { status: 400, headers });
    if (stops.filter((s: any) => s && s.addr).length < 1) return new Response(JSON.stringify({ error: 'At least one address is required' }), { status: 400, headers });

    const stairs = !!body.stairs, elevator = !!body.elevator, longWalk = !!body.long_walk;
    const special = Array.isArray(body.special_items)
      ? body.special_items.filter((k: string) => HEAVY_PRICES[k] != null).slice(0, 20) : [];
    const reqDate = /^\d{4}-\d{2}-\d{2}$/.test(body.requested_date || '') ? body.requested_date : null;
    const reqTime = String(body.requested_time || '').match(/^\d{1,2}:00\s*(AM|PM)$/i) ? body.requested_time : null;

    // ── Recommended price (server-authoritative) ────────────────────────────
    const base = BASE_PRICES[jobSize];
    const miles = multiStopMiles(stops);
    const distanceCents = miles > DISTANCE_FREE_MILES ? (miles - DISTANCE_FREE_MILES) * DISTANCE_PER_MILE : 0;
    const accessCents = (stairs ? STAIRS_SURCHARGE : 0) + (elevator ? ELEVATOR_SURCHARGE : 0) + (longWalk ? LONG_WALK_SURCHARGE : 0);
    const heavyCents = special.reduce((s: number, k: string) => s + (HEAVY_PRICES[k] || 0), 0);
    const subtotal = base + distanceCents + accessCents + heavyCents;
    const recommended = Math.round(subtotal * (1 + TAX));

    const driveHours = miles / DRIVE_MPH;
    const estHours = Math.round(((ESTIMATED_HOURS[jobSize] || 3) + driveHours) * 10) / 10;

    // ── Calendar availability — duration-aware. Each existing booking blocks its
    //    FULL span (start → start+duration); the NEW job's estimated duration must
    //    fit without overlapping. get_booked_slots already includes paid consumer
    //    leads + admin-blocked slots + booked business jobs (migration 052). ───────
    let slotConflict = false;
    let suggestedTime: string | null = null;
    if (reqDate && reqTime) {
      const occupied = new Set<number>();
      const { data: booked } = await svc.rpc('get_booked_slots', { p_date: reqDate });
      (booked || []).forEach((b: any) => {
        const s = parseHourLabel(b.preferred_time);
        if (s == null) return;
        const dur = estBookedHours(b);
        for (let h = s; h < s + dur; h++) occupied.add(Math.floor(h));
      });
      const newDur = Math.max(1, Math.ceil(estHours)); // this job's own footprint
      const fits = (start: number | null) => {
        if (start == null) return false;
        for (let h = start; h < start + newDur; h++) { if (h > DAY_END || occupied.has(h)) return false; }
        return true;
      };
      slotConflict = !fits(parseHourLabel(reqTime));
      if (slotConflict) {
        for (let h = DAY_START; h <= DAY_END; h++) { if (fits(h)) { suggestedTime = to12h(h); break; } }
      }
    }

    // ── Decision rules ──────────────────────────────────────────────────────
    let decision: 'accepted' | 'countered' | 'pending';
    let reason = '';
    let counterPrice: number | null = null;
    if (estHours > MAX_HOURS_AUTO) {
      decision = 'pending';
      reason = `Estimated ~${estHours} hrs (over ${MAX_HOURS_AUTO}h) — needs manual review.`;
    } else if (slotConflict) {
      decision = 'countered';
      reason = suggestedTime
        ? `That time conflicts with the schedule for a ~${estHours}h job. Suggested open start: ${suggestedTime}.`
        : `That day is full for a ~${estHours}h job — we'll reach out with options.`;
    } else if (offered >= Math.round(recommended * ACCEPT_RATIO)) {
      decision = 'accepted';
      reason = `Offer accepted (recommended ${(recommended / 100).toFixed(2)}).`;
    } else {
      decision = 'countered';
      counterPrice = recommended;
      reason = `Offer below our minimum for this job — counter at the recommended price.`;
    }

    const scheduledFor = decision === 'accepted' ? buildScheduledFor(reqDate, reqTime) : null;

    // ── Store the business job ──────────────────────────────────────────────
    const { data: row, error: insErr } = await svc.from('business_jobs').insert({
      customer_name: name, customer_phone: phone, customer_email: body.customer_email || null,
      photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls.slice(0, 12) : [],
      stops, job_size: jobSize, stairs, elevator, long_walk: longWalk, special_items: special,
      access_notes: String(body.access_notes || '').slice(0, 1000) || null,
      distance_miles: miles, offered_price_cents: offered, recommended_price_cents: recommended,
      counter_price_cents: counterPrice, estimated_duration_hours: estHours,
      requested_date: reqDate, requested_time: reqTime, scheduled_for: scheduledFor,
      decision, decision_reason: reason, status: decision === 'accepted' ? 'booked' : 'new',
      notes: String(body.notes || '').slice(0, 2000) || null, decided_at: new Date().toISOString(),
    }).select('id, job_number').single();
    if (insErr || !row) {
      console.error('business_jobs insert failed:', insErr?.message);
      return new Response(JSON.stringify({ error: 'Could not submit job' }), { status: 500, headers });
    }

    // ── On accept, BILL the business: create the UNPAID gig + email a Stripe
    //    pay-link (shared billBusinessJob — same path as the admin "Book" button).
    if (decision === 'accepted') {
      try {
        await billBusinessJob(svc, stripe, Deno.env.get('RESEND_API_KEY'), row.id);
      } catch (e) {
        console.error('billBusinessJob failed:', e);
      }
    }

    // ── Confirmation email for NON-accepted jobs (accepted jobs get the pay-link
    //    email from bill-business-job instead). business contact + the FFW inbox.
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey && decision !== 'accepted') {
      const recipients = ['fastfixworkservices@gmail.com'];
      const custEmail = String(body.customer_email || '').trim();
      if (custEmail) recipients.unshift(custEmail);
      const money = (c: number) => `$${(c / 100).toFixed(2)}`;
      const orderedStops = stops.filter((s: any) => s && s.addr);
      const routeHtml = orderedStops.map((s: any, i: number) => `${i + 1}. ${escHtml(s.addr)}`).join('<br>') || '—';
      const outcome = decision === 'accepted'
        ? `<b>Accepted</b> — your job is booked${scheduledFor ? ' for ' + new Date(scheduledFor).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}.`
        : decision === 'countered'
          ? `<b>Counter offer</b> — ${escHtml(reason)}`
          : `<b>Under review</b> — ${escHtml(reason)}`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Fast Fix Work <noreply@fastfixwork.com>',
          to: recipients,
          subject: `Business job #${row.job_number} — ${decision === 'accepted' ? 'booked' : decision === 'countered' ? 'counter offer' : 'received'} — Fast Fix Work`,
          html: `<div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
            <div style="text-align:center;margin-bottom:24px;"><span style="font-size:28px;font-weight:800;color:#C98B3F;font-family:Georgia,serif;">Fast Fix Work</span></div>
            <h2 style="color:#1A1714;margin-bottom:4px;">Hi ${escHtml(name)}, we got your request</h2>
            <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:16px;">${outcome}</p>
            <div style="background:#FAF7F2;border:1.5px solid #E8E0D4;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
              <div style="font-size:13px;color:#C98B3F;font-weight:700;margin-bottom:10px;">Job #${row.job_number}</div>
              <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#888;">Job size</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escHtml(jobSize)}</td></tr>
                <tr><td style="padding:4px 0;color:#888;vertical-align:top;">Route</td><td style="padding:4px 0;text-align:right;font-weight:600;">${routeHtml}</td></tr>
                <tr><td style="padding:4px 0;color:#888;">Your offer</td><td style="padding:4px 0;text-align:right;font-weight:600;">${money(offered)}</td></tr>
                <tr><td style="padding:8px 0 4px;color:#888;border-top:1px solid #E8E0D4;">Recommended</td><td style="padding:8px 0 4px;text-align:right;font-weight:800;font-size:16px;color:#1A1714;border-top:1px solid #E8E0D4;">${money(recommended)}</td></tr>
              </table>
            </div>
            <p style="color:#555;font-size:14px;line-height:1.6;">Questions? Call or text <a href="tel:5127771628" style="color:#C98B3F;font-weight:600;">512-777-1628</a>.</p>
            <p style="color:#aaa;font-size:12px;text-align:center;margin-top:20px;">Fast Fix Work LLC · Austin, TX</p>
          </div>`,
        }),
      });
      console.log(`Business job #${row.job_number} email sent to ${recipients.join(', ')}`);
    }

    return new Response(JSON.stringify({
      job_number: row.job_number, decision, decision_reason: reason,
      recommended_price_cents: recommended, counter_price_cents: counterPrice,
      estimated_duration_hours: estHours, distance_miles: miles,
      scheduled_for: scheduledFor, suggested_time: suggestedTime,
    }), { status: 200, headers });
  } catch (err) {
    console.error('submit-business-job error:', err);
    return new Response(JSON.stringify({ error: 'Could not submit job' }), { status: 500, headers });
  }
});
