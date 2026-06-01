// Stripe webhook handler — TEST-MODE clone of stripe-webhook.
//
// Exists ONLY so the development app build's test payments complete the full
// chain (gig → in_progress + payout amounts stamped). Reads SEPARATE secrets
// (STRIPE_SECRET_KEY_TEST + STRIPE_WEBHOOK_SECRET_TEST) so the live webhook,
// live secret, and the SiteGround intake flow are completely unaffected.
//
// Deploy: supabase functions deploy stripe-webhook-test --no-verify-jwt
// Secret: supabase secrets set STRIPE_WEBHOOK_SECRET_TEST=whsec_...
// Stripe (TEST mode) endpoint: https://<project>.supabase.co/functions/v1/stripe-webhook-test
// Events: payment_intent.succeeded, payment_intent.payment_failed

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY_TEST')!, {
  apiVersion: '2024-04-10',
});

// Platform service fee — must match lib/pricing.ts PLATFORM_FEE_PERCENT.
const PLATFORM_FEE_PERCENT = 15;

serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET_TEST')!,
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

    // Test mode only exercises the app gig flow. The intake/quote-lead path is
    // live-only, so we intentionally do NOT handle quote_request_id here (no
    // accidental test confirmation emails / fake bookings).
    if (gigId) {
      await supabase
        .from('payments')
        .update({ status: 'captured', captured_at: new Date().toISOString() })
        .eq('stripe_payment_intent_id', intent.id);

      const total = parseInt(intent.metadata?.total_price_cents || '0', 10) || intent.amount;
      const platform_fee_cents = parseInt(intent.metadata?.platform_fee_cents || '0', 10) || Math.round(total * (PLATFORM_FEE_PERCENT / 100));
      const mover_payout_cents = parseInt(intent.metadata?.mover_payout_cents || '0', 10) || (total - platform_fee_cents);

      await supabase
        .from('gigs')
        .update({
          status: 'in_progress',
          paid_at: new Date().toISOString(),
          platform_fee_cents,
          mover_payout_cents,
          payout_status: 'unpaid',
        })
        .eq('id', gigId)
        .eq('status', 'matched');
      console.log(`[TEST] Payment succeeded for gig ${gigId}`);
    } else {
      console.log('[TEST] No gig_id in metadata, skipping');
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const gigId = intent.metadata?.gig_id;
    if (gigId) {
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', intent.id);
      console.log(`[TEST] Payment failed for gig ${gigId}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
