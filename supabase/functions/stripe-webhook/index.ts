// Stripe webhook handler — verifies signature, updates payment + gig status server-side
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Set secret: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Configure in Stripe dashboard: Endpoint URL = https://<project>.supabase.co/functions/v1/stripe-webhook
// Events to send: payment_intent.succeeded, payment_intent.payment_failed

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
});

serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const gigId = intent.metadata?.gig_id;

    if (!gigId) {
      console.log('No gig_id in metadata, skipping');
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Update payment to captured
    await supabase
      .from('payments')
      .update({ status: 'captured', captured_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', intent.id);

    // Advance gig to in_progress (only if currently matched)
    await supabase
      .from('gigs')
      .update({ status: 'in_progress' })
      .eq('id', gigId)
      .eq('status', 'matched');

    console.log(`Payment succeeded for gig ${gigId}`);
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const gigId = intent.metadata?.gig_id;

    if (gigId) {
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', intent.id);

      console.log(`Payment failed for gig ${gigId}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
