// Supabase Edge Function — creates a Stripe PaymentIntent for full upfront payment
// Used by the public intake form (no auth required, uses quote_request_id for verification)
// Deploy: supabase functions deploy create-quote-payment --no-verify-jwt

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

    // Verify the quote request exists
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: quote, error: quoteError } = await supabase
      .from('quote_requests')
      .select('id, name, email, estimated_price_cents, payment_status, lead_number')
      .eq('id', quote_request_id)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: 'Quote request not found' }),
        { status: 404, headers },
      );
    }

    // Use server-side price — never trust client-sent amounts.
    // Customer pays 100% upfront; mover is paid out after the job.
    const total_cents = quote.estimated_price_cents;
    if (!total_cents || total_cents < 50) {
      return new Response(
        JSON.stringify({ error: 'Quote has no valid price' }),
        { status: 400, headers },
      );
    }

    // Cap at reasonable max ($50,000 job)
    if (total_cents > 5000000) {
      return new Response(
        JSON.stringify({ error: 'Amount exceeds maximum' }),
        { status: 400, headers },
      );
    }

    // Don't allow double-payment
    if (quote.payment_status === 'paid') {
      return new Response(
        JSON.stringify({ error: 'Already paid' }),
        { status: 400, headers },
      );
    }

    // Create PaymentIntent using the DB price
    const paymentIntent = await stripe.paymentIntents.create({
      amount: total_cents,
      currency: 'usd',
      metadata: {
        quote_request_id,
        type: 'quote_full_payment',
        customer_name: quote.name || '',
        customer_email: quote.email || '',
        total_price_cents: (quote.estimated_price_cents || 0).toString(),
      },
      receipt_email: quote.email || undefined,
    });

    // Update quote_requests with payment info
    await supabase
      .from('quote_requests')
      .update({
        deposit_cents: total_cents,
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
