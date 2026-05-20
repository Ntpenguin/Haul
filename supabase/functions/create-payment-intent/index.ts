// Supabase Edge Function — creates a Stripe PaymentIntent for the 10% deposit
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
    'Access-Control-Allow-Origin': '*',
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

    // Parse request body — amount_cents is the deposit amount (10% of total)
    const { gig_id, amount_cents } = await req.json();
    if (!gig_id || !amount_cents) {
      return new Response(JSON.stringify({ error: 'gig_id and amount_cents required' }), { status: 400, headers });
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

    // Create the PaymentIntent for the deposit amount
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      metadata: {
        gig_id,
        customer_id: user.id,
        mover_id: gig.mover_id || '',
        total_price_cents: (gig.quoted_price_cents || 0).toString(),
        deposit_cents: amount_cents.toString(),
        type: 'deposit',
      },
    });

    // Record the payment in our database
    await supabase.from('payments').insert({
      gig_id,
      customer_id: user.id,
      mover_id: gig.mover_id,
      amount_cents,
      platform_fee_cents: amount_cents, // The deposit IS the platform revenue
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
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers },
    );
  }
});
