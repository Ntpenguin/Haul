// Supabase Edge Function — creates a Stripe PaymentIntent for full upfront payment
// Used by the public intake form (no auth required, uses quote_request_id for verification)
// Deploy: supabase functions deploy create-quote-payment --no-verify-jwt
//
// SECURITY: the charge amount is RECOMPUTED server-side from the saved move
// details (items_size, stairs, distance, special items, staging, packing, …) —
// it never trusts the client-supplied estimated_price_cents. This mirrors the
// intake form's calcQuote() exactly (landing/intake.html). Keep the two in sync.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Browser origins allowed to call this public endpoint. Production is the live
// site; localhost entries are for local testing of the intake form only.
const ALLOWED_ORIGINS = [
  'https://fastfixwork.com',
  'https://www.fastfixwork.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// ── Pricing constants — MUST stay in sync with landing/intake.html calcQuote() ──
const BASE_PRICES: Record<string, number> = {
  'Single item': 9375, 'Just a few items': 17500, 'Studio': 35000, '1 BR': 50000,
  '2 BR': 80000, '3 BR': 135000, '4+ BR / full house': 160000,
};
const STAIRS_SURCHARGE = 5000;
const ELEVATOR_SURCHARGE = 4000; // $40 per location that has an elevator
const LONG_CARRY = 5000;
const HEAVY_PRICES: Record<string, number> = {
  'Piano': 25000, 'Safe / gun safe': 15000, 'Pool table': 30000,
  'Treadmill / Peloton': 7500, 'Big TV (65"+)': 7500, 'Aquarium': 7500, 'Artwork / mirror': 7500,
};
const HEAVY_DEFAULT = 7500;
const TAX = 0.0825;
const DISTANCE_FREE_MILES = 15;
const DISTANCE_PER_MILE = 125;
const LONG_DISTANCE_MULTIPLIER = 1.5;
const LONG_DISTANCE_THRESHOLD = 50;
const STAGING_SURCHARGE_PCT = 0.30;
const PACKING_SURCHARGE_PCT = 0.25;

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Recompute the quote total (in cents) from the saved move details. Mirrors
// calcQuote() in landing/intake.html. Returns null when the move can't be
// auto-quoted (e.g. custom / unknown size) — same as the intake form.
function computeQuoteTotalCents(q: any): number | null {
  const base = BASE_PRICES[q.items_size];
  if (!base) return null;

  const hasStairs = (lbl: string) => lbl === 'Stairs' || lbl === 'Both';
  const hasElevator = (lbl: string) => lbl === 'Elevator' || lbl === 'Both';
  const flightsFrom = hasStairs(q.stairs_pickup) ? Math.max(1, q.flights_pickup || 1) : 0;
  const flightsTo = hasStairs(q.stairs_dropoff) ? Math.max(1, q.flights_dropoff || 1) : 0;
  const stairsCents = (flightsFrom + flightsTo) * STAIRS_SURCHARGE;

  const elevators = (hasElevator(q.stairs_pickup) ? 1 : 0) + (hasElevator(q.stairs_dropoff) ? 1 : 0);
  const elevatorCents = elevators * ELEVATOR_SURCHARGE;

  const carryCents = (q.parking || '').includes('100+') ? LONG_CARRY : 0;

  const special = Array.isArray(q.special_items) ? q.special_items : [];
  const heavyCents = special
    .filter((k: string) => k && k !== 'Nope — just regular stuff')
    .reduce((s: number, k: string) => s + (HEAVY_PRICES[k] || HEAVY_DEFAULT), 0);

  // Distance from the stored Nominatim coords (answers jsonb). Absent coords → no
  // distance surcharge, matching the intake form when geocoding is unavailable.
  const addr = q.answers?.addresses || {};
  const pu = addr.pickup, dr = addr.dropoff;
  let miles: number | null = null;
  if (pu?.lat != null && pu?.lng != null && dr?.lat != null && dr?.lng != null) {
    miles = Math.round(haversineMiles(pu.lat, pu.lng, dr.lat, dr.lng));
  }
  const distanceCents = (miles && miles > DISTANCE_FREE_MILES) ? (miles - DISTANCE_FREE_MILES) * DISTANCE_PER_MILE : 0;

  const isLongDistance = q.service_type === 'Long distance' || (miles != null && miles >= LONG_DISTANCE_THRESHOLD);
  const adjustedBase = base * (isLongDistance ? LONG_DISTANCE_MULTIPLIER : 1);

  const stagingCents = q.staging ? Math.round(adjustedBase * STAGING_SURCHARGE_PCT) : 0;
  const packingCents = q.packing_service ? Math.round(adjustedBase * PACKING_SURCHARGE_PCT) : 0;

  const subtotal = Math.round(adjustedBase + stairsCents + elevatorCents + carryCents + heavyCents + distanceCents + stagingCents + packingCents);
  const tax = Math.round(subtotal * TAX);
  return subtotal + tax;
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
      return new Response(
        JSON.stringify({ error: 'quote_request_id required' }),
        { status: 400, headers },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limit PaymentIntent creation to curb abuse / Stripe cost.
    // Trust only proxy-set IP headers — the leftmost X-Forwarded-For value is
    // client-spoofable. Supabase/Cloudflare sets cf-connecting-ip at the trusted
    // edge; otherwise take the RIGHTMOST XFF entry (appended by the real proxy).
    const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean).pop();
    const clientIp = req.headers.get('cf-connecting-ip') || xff || 'unknown';
    // Limit per IP (abuse) AND per quote (so one lead can't be hammered from many
    // IPs). Fails open only if the limiter RPC itself is unavailable.
    const rlChecks = await Promise.all([
      supabase.rpc('check_rate_limit', { p_bucket: 'create-quote-payment:ip', p_key: clientIp, p_max: 12, p_window_seconds: 3600 }),
      supabase.rpc('check_rate_limit', { p_bucket: 'create-quote-payment:quote', p_key: quote_request_id, p_max: 8, p_window_seconds: 3600 }),
    ]);
    const rlError = rlChecks.find((r) => r.error)?.error;
    const rlBlocked = rlChecks.some((r) => r.data === false);
    if (rlError) {
      console.warn('Rate limiter unavailable, allowing request:', rlError.message);
    } else if (rlBlocked) {
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please wait a few minutes and try again.' }),
        { status: 429, headers },
      );
    }

    // Load the lead with every column needed to recompute the price server-side.
    const { data: quote, error: quoteError } = await supabase
      .from('quote_requests')
      .select(
        'id, name, email, phone, lead_number, payment_status, estimated_price_cents, ' +
        'items_size, service_type, stairs_pickup, stairs_dropoff, flights_pickup, ' +
        'flights_dropoff, parking, special_items, staging, packing_service, answers, ' +
        'referral_code, referral_credit_cents',
      )
      .eq('id', quote_request_id)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: 'Quote request not found' }),
        { status: 404, headers },
      );
    }

    // Don't allow double-payment.
    if (quote.payment_status === 'paid') {
      return new Response(
        JSON.stringify({ error: 'Already paid' }),
        { status: 400, headers },
      );
    }

    // Recompute the charge from move details — NEVER trust the client's price.
    const total_cents = computeQuoteTotalCents(quote);
    if (!total_cents || total_cents < 50) {
      return new Response(
        JSON.stringify({ error: 'This move needs a manual quote — please call 512-777-1628.' }),
        { status: 400, headers },
      );
    }

    // Cap at a reasonable max ($50,000 job).
    if (total_cents > 5000000) {
      return new Response(
        JSON.stringify({ error: 'Amount exceeds maximum' }),
        { status: 400, headers },
      );
    }

    // Log when the client-displayed price disagrees with the authoritative server
    // price (possible tampering or a client/server pricing drift to investigate).
    if (quote.estimated_price_cents && quote.estimated_price_cents !== total_cents) {
      console.warn(
        `Price mismatch for quote ${quote_request_id}: client=${quote.estimated_price_cents} server=${total_cents}`,
      );
    }

    // ── Referral credit (one-time $25 off for a referred customer) ────────────
    // The credit is server-authoritative: the form shows it via the same
    // referral_lookup() RPC, so the displayed total always equals the charge.
    let creditCents = 0;
    const refCode = (quote.referral_code || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
    if (refCode) {
      // Idempotent: reuse an existing redemption row for this lead (back-nav re-submit).
      const { data: existing } = await supabase
        .from('referrals').select('id, credit_cents').eq('quote_request_id', quote.id).maybeSingle();
      if (existing) {
        creditCents = existing.credit_cents || 0;
      } else {
        const { data: look } = await supabase.rpc('referral_lookup', {
          p_code: refCode, p_email: quote.email, p_phone: quote.phone, p_name: quote.name,
        });
        creditCents = Math.max(0, parseInt(look?.credit_cents) || 0);
        if (creditCents > 0) {
          const { data: rc } = await supabase
            .from('referral_codes')
            .select('code, referrer_name, referrer_email, referrer_phone, payout_handle, reward_cents')
            .ilike('code', refCode).maybeSingle();
          // Record the redemption (UNIQUE on quote_request_id makes this idempotent).
          await supabase.from('referrals').insert({
            referral_code: rc?.code || refCode,
            referrer_name: rc?.referrer_name ?? null,
            referrer_email: rc?.referrer_email ?? null,
            referrer_phone: rc?.referrer_phone ?? null,
            payout_handle: rc?.payout_handle ?? null,
            referred_name: quote.name ?? null,
            referred_email: quote.email ?? null,
            referred_phone: quote.phone ?? null,
            quote_request_id: quote.id,
            credit_cents: creditCents,
            reward_cents: rc?.reward_cents ?? 2000,
            reward_status: 'pending',
          });
        }
      }
      // Never let the credit exceed the price (keep the charge above Stripe's $0.50 min).
      if (creditCents > total_cents - 50) creditCents = Math.max(0, total_cents - 50);
    }
    const charge_cents = total_cents - creditCents;

    // Create the PaymentIntent for the (credit-adjusted) server-computed amount.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: charge_cents,
      currency: 'usd',
      metadata: {
        quote_request_id,
        type: 'quote_full_payment',
        customer_name: quote.name || '',
        customer_email: quote.email || '',
        gross_price_cents: total_cents.toString(),
        referral_credit_cents: creditCents.toString(),
        total_price_cents: charge_cents.toString(),
      },
      receipt_email: quote.email || undefined,
    });

    // Persist the authoritative price + payment info. estimated_price_cents = the
    // gross move price; deposit_cents = what was actually charged (after credit);
    // referral_credit_cents lets the webhook gross the mover payout back up.
    await supabase
      .from('quote_requests')
      .update({
        estimated_price_cents: total_cents,
        deposit_cents: charge_cents,
        referral_credit_cents: creditCents,
        stripe_payment_intent_id: paymentIntent.id,
        payment_status: 'pending',
      })
      .eq('id', quote_request_id);

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret, lead_number: quote.lead_number }),
      { status: 200, headers },
    );
  } catch (err: any) {
    console.error('Error creating quote payment intent:', err);
    return new Response(
      JSON.stringify({ error: 'Payment processing failed' }),
      { status: 500, headers },
    );
  }
});
