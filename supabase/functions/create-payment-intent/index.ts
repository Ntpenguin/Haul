// Supabase Edge Function — creates a Stripe PaymentIntent for the full price (100% upfront)
// Deploy: supabase functions deploy create-payment-intent --no-verify-jwt
// Set secret: supabase secrets set STRIPE_SECRET_KEY=sk_test_...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
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

    // Rate limit PaymentIntent creation per user to curb abuse / Stripe cost.
    // Fails open if the limiter RPC isn't available (e.g. migration not yet run).
    const { data: rlAllowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      p_bucket: 'create-payment-intent',
      p_key: user.id,
      p_max: 15,
      p_window_seconds: 3600,
    });
    if (rlError) {
      console.warn('Rate limiter unavailable, allowing request:', rlError.message);
    } else if (rlAllowed === false) {
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please wait a few minutes and try again.' }),
        { status: 429, headers },
      );
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

    // Customer pays 100% upfront through the app. The platform keeps a
    // platform fee and pays the worker the remainder after the job via
    // Stripe Connect (see transfer-to-mover). Charge the full amount.
    const PLATFORM_FEE_PERCENT = 15;
    const platform_fee_cents = Math.round(total_cents * (PLATFORM_FEE_PERCENT / 100));
    const mover_payout_cents = total_cents - platform_fee_cents;

    // Create the PaymentIntent for the full amount
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
    console.error('Error creating payment intent:', err);
    return new Response(
      JSON.stringify({ error: 'Payment processing failed' }),
      { status: 500, headers },
    );
  }
});
