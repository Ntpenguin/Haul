// Supabase Edge Function — TEST-MODE clone of create-payment-intent.
//
// This exists ONLY so the development app build can run real Stripe test
// payments (pk_test + sk_test) WITHOUT touching the live create-payment-intent
// function or the live STRIPE_SECRET_KEY. It reads a SEPARATE secret,
// STRIPE_SECRET_KEY_TEST, so the live flow (app prod build + SiteGround intake)
// is completely unaffected.
//
// Deploy:  supabase functions deploy create-payment-intent-test --no-verify-jwt
// Secret:  supabase secrets set STRIPE_SECRET_KEY_TEST=sk_test_...
//
// The app only calls this function when the build sets
// EXPO_PUBLIC_STRIPE_MODE=test (development EAS environment). Prod/preview
// builds have no such var and keep calling the live create-payment-intent.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY_TEST')!, {
  apiVersion: '2024-04-10',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://fastfixwork.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No auth token' }), { status: 401, headers });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    // Parse request body — only gig_id needed; price comes from DB
    const { gig_id } = await req.json();
    if (!gig_id) {
      return new Response(JSON.stringify({ error: 'gig_id required' }), { status: 400, headers });
    }

    // Verify the gig exists and belongs to this customer
    const { data: gig, error: gigError } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', gig_id)
      .single();

    if (gigError || !gig) {
      return new Response(JSON.stringify({ error: 'Gig not found' }), { status: 404, headers });
    }

    if (gig.customer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not your gig' }), { status: 403, headers });
    }

    // Use server-side price — never trust client-sent amounts
    const total_cents = gig.quoted_price_cents;
    if (!total_cents || total_cents < 50) {
      return new Response(JSON.stringify({ error: 'Gig has no valid price' }), { status: 400, headers });
    }

    const PLATFORM_FEE_PERCENT = 15;
    const platform_fee_cents = Math.round(total_cents * (PLATFORM_FEE_PERCENT / 100));
    const mover_payout_cents = total_cents - platform_fee_cents;

    // Create the PaymentIntent for the full amount (TEST MODE)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: total_cents,
      currency: 'usd',
      metadata: {
        gig_id,
        customer_id: user.id,
        mover_id: gig.mover_id || '',
        total_price_cents: total_cents.toString(),
        platform_fee_cents: platform_fee_cents.toString(),
        mover_payout_cents: mover_payout_cents.toString(),
        type: 'full_payment',
        mode: 'test',
      },
    });

    // Record the payment in our database (full charge; payout settled later)
    await supabase.from('payments').insert({
      gig_id,
      customer_id: user.id,
      mover_id: gig.mover_id,
      amount_cents: total_cents,
      platform_fee_cents,
      stripe_payment_intent_id: paymentIntent.id,
      status: 'pending',
    });

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { status: 200, headers },
    );
  } catch (err: any) {
    console.error('Error creating TEST payment intent:', err);
    return new Response(
      JSON.stringify({ error: 'Payment processing failed' }),
      { status: 500, headers },
    );
  }
});
