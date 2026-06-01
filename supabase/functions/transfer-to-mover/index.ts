// Supabase Edge Function — pays out a completed, paid gig to the mover's Stripe
// Connect account. Uses separate transfers (the customer's full payment landed in
// the platform balance; here we move the mover's share to their connected account).
//
// Guards: gig must be completed + paid, not already paid out, and the mover must
// have a payouts-enabled connected account. The payout amount is read server-side
// from gigs.mover_payout_cents — never trusted from the client.
//
// Deploy: supabase functions deploy transfer-to-mover
// Secrets: STRIPE_SECRET_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PLATFORM_FEE_PERCENT = 15;

serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'No auth token' }), { status: 401, headers });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });

    const { gig_id } = await req.json();
    if (!gig_id) return new Response(JSON.stringify({ error: 'gig_id required' }), { status: 400, headers });

    const { data: gig, error: gigErr } = await supabase
      .from('gigs')
      .select('id, customer_id, mover_id, status, paid_at, payout_status, quoted_price_cents, mover_payout_cents')
      .eq('id', gig_id)
      .single();
    if (gigErr || !gig) return new Response(JSON.stringify({ error: 'Gig not found' }), { status: 404, headers });

    // Only the gig's mover, its customer, or an admin context may trigger payout.
    if (gig.mover_id !== user.id && gig.customer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorized for this gig' }), { status: 403, headers });
    }

    if (gig.status !== 'completed') {
      return new Response(JSON.stringify({ error: 'Gig is not completed yet' }), { status: 400, headers });
    }
    if (!gig.paid_at) {
      return new Response(JSON.stringify({ error: 'Gig has not been paid by the customer' }), { status: 400, headers });
    }
    if (gig.payout_status === 'paid') {
      return new Response(JSON.stringify({ error: 'Already paid out', already: true }), { status: 409, headers });
    }
    if (!gig.mover_id) {
      return new Response(JSON.stringify({ error: 'Gig has no assigned mover' }), { status: 400, headers });
    }

    const { data: mover } = await supabase
      .from('mover_profiles')
      .select('stripe_account_id, payouts_enabled')
      .eq('id', gig.mover_id)
      .single();
    if (!mover?.stripe_account_id || !mover.payouts_enabled) {
      return new Response(JSON.stringify({ error: 'Mover has not completed payout onboarding' }), { status: 400, headers });
    }

    // Server-side payout amount. Fall back to computing it from the quote if the
    // stored value is missing.
    const payoutCents = gig.mover_payout_cents
      ?? (gig.quoted_price_cents ? gig.quoted_price_cents - Math.round(gig.quoted_price_cents * (PLATFORM_FEE_PERCENT / 100)) : 0);
    if (!payoutCents || payoutCents < 1) {
      return new Response(JSON.stringify({ error: 'No payout amount for this gig' }), { status: 400, headers });
    }

    // Mark pending first so concurrent requests don't double-transfer.
    await supabase.from('gigs').update({ payout_status: 'pending' }).eq('id', gig_id).neq('payout_status', 'paid');

    const transfer = await stripe.transfers.create(
      {
        amount: payoutCents,
        currency: 'usd',
        destination: mover.stripe_account_id,
        metadata: { gig_id, mover_id: gig.mover_id },
      },
      { idempotencyKey: `payout_${gig_id}` },
    );

    await supabase
      .from('gigs')
      .update({ payout_status: 'paid', stripe_transfer_id: transfer.id, payout_at: new Date().toISOString() })
      .eq('id', gig_id);

    return new Response(JSON.stringify({ transfer_id: transfer.id, amount_cents: payoutCents }), { status: 200, headers });
  } catch (err: any) {
    console.error('transfer-to-mover error:', err);
    // Reset to unpaid so it can be retried.
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const body = await req.clone().json().catch(() => ({}));
      if (body?.gig_id) await supabase.from('gigs').update({ payout_status: 'failed' }).eq('id', body.gig_id).neq('payout_status', 'paid');
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: 'Payout failed' }), { status: 500, headers });
  }
});
