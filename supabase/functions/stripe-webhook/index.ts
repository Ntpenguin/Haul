// Stripe webhook handler — verifies signature, updates payment + gig status server-side
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Set secret: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Configure in Stripe dashboard: Endpoint URL = https://<project>.supabase.co/functions/v1/stripe-webhook
// Events to send: payment_intent.succeeded, payment_intent.payment_failed, account.updated

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';
import { sendSms } from '../_shared/twilio.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
});

// Platform service fee — must match lib/pricing.ts PLATFORM_FEE_PERCENT.
const PLATFORM_FEE_PERCENT = 15;

// Intake form stores preferred_date as 'YYYY-MM-DD' and preferred_time as
// 'H:00 AM/PM' (Austin / America-Chicago local time). Build a UTC ISO string
// for the gig's scheduled_for so it lands correctly on the admin calendar.
function buildScheduledFor(dateStr?: string | null, timeStr?: string | null): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  let hour = 9; // sensible default if time is missing/unparseable
  const m = (timeStr || '').match(/^(\d{1,2}):00\s*(AM|PM)$/i);
  if (m) {
    hour = parseInt(m[1], 10);
    if (m[2].toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (m[2].toUpperCase() === 'AM' && hour === 12) hour = 0;
  }
  const hh = String(hour).padStart(2, '0');
  try {
    // Determine the Central offset (CDT -05:00 / CST -06:00) for this instant.
    const probe = new Date(`${dateStr}T${hh}:00:00Z`);
    const tzName = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      timeZoneName: 'short',
    }).formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value;
    const offset = tzName === 'CDT' ? '05' : '06';
    return new Date(`${dateStr}T${hh}:00:00-${offset}:00`).toISOString();
  } catch {
    return null;
  }
}

// Haversine miles between two lat/lng points (lead-gig distance → difficulty/duration).
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

    // Admin-initiated surcharge (create-surcharge). Tagged on the PaymentIntent so
    // it is NOT mistaken for an app-gig or lead payment — handle it first and return.
    if (intent.metadata?.type === 'surcharge') {
      const surchargeId = intent.metadata?.surcharge_id;
      if (surchargeId) {
        await supabase
          .from('surcharges')
          .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: intent.id })
          .eq('id', surchargeId);
        console.log(`Surcharge ${surchargeId} paid`);
      }
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // Business job pay-link (bill-business-job). Mark the job paid + stamp the gig.
    if (intent.metadata?.type === 'business_job') {
      const bjId = intent.metadata?.business_job_id;
      const bjGigId = intent.metadata?.gig_id;
      if (bjId) {
        await supabase
          .from('business_jobs')
          .update({ payment_status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: intent.id })
          .eq('id', bjId);
      }
      if (bjGigId) {
        await supabase.from('gigs').update({ paid_at: new Date().toISOString() }).eq('id', bjGigId);
      }
      console.log(`Business job ${bjId} paid`);
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const gigId = intent.metadata?.gig_id;
    const quoteId = intent.metadata?.quote_request_id;

    if (quoteId) {
      // Intake-form lead paid in full. Fetch the full lead, mark it paid, and
      // convert it into a marketplace gig that movers can apply to (only paid
      // leads become gigs / appear on the calendar). Keep the lead row forever.
      const { data: quote } = await supabase
        .from('quote_requests')
        .select('id, gig_id, name, email, phone, lead_number, preferred_date, preferred_time, pickup_address, dropoff_address, service_type, items_size, items_list, deposit_cents, estimated_price_cents, stairs_pickup, stairs_dropoff, flights_pickup, flights_dropoff, staging, packing_service, other_notes, special_items, answers, referral_code, referral_credit_cents, sms_consent')
        .eq('stripe_payment_intent_id', intent.id)
        .single();

      await supabase
        .from('quote_requests')
        .update({ payment_status: 'paid' })
        .eq('stripe_payment_intent_id', intent.id);

      // Convert to a marketplace gig (idempotent — skip if already converted)
      if (quote && !quote.gig_id) {
        // Price the gig off the amount Stripe ACTUALLY captured (intent.amount),
        // not the lead's estimated_price_cents — those can diverge if the customer
        // edited the quote after the PaymentIntent was created (back-nav), which
        // would otherwise let mover_payout exceed what we collected.
        // Gross the referral credit back up so the platform — not the mover —
        // absorbs the $25 discount: the mover is paid 85% of the FULL move price.
        const referralCredit = quote.referral_credit_cents || 0;
        const total = intent.amount
          ? intent.amount + referralCredit
          : (quote.estimated_price_cents || quote.deposit_cents || 0);
        const platform_fee_cents = Math.round(total * (PLATFORM_FEE_PERCENT / 100));
        const mover_payout_cents = total - platform_fee_cents;
        const hasStairsPU = quote.stairs_pickup === 'Stairs' || quote.stairs_pickup === 'Both';
        const hasStairsDO = quote.stairs_dropoff === 'Stairs' || quote.stairs_dropoff === 'Both';

        // Distance (drives difficulty + duration): haversine of the saved address
        // coords; treat a manual "Long distance" pick as >= 50 mi if coords are absent.
        const addr = (quote.answers as any)?.addresses || {};
        const pu = addr.pickup, dr = addr.dropoff;
        let distanceMiles: number | null = null;
        if (pu?.lat != null && pu?.lng != null && dr?.lat != null && dr?.lng != null) {
          distanceMiles = Math.round(haversineMiles(pu.lat, pu.lng, dr.lat, dr.lng));
        }
        if (quote.service_type === 'Long distance' && (distanceMiles == null || distanceMiles < 50)) {
          distanceMiles = 50;
        }

        const { data: newGig, error: gigErr } = await supabase
          .from('gigs')
          .insert({
            customer_id: null,
            quote_request_id: quote.id,
            status: 'posted',
            from_address: quote.pickup_address || 'Address to confirm',
            to_address: quote.dropoff_address || 'Address to confirm',
            home_size: quote.items_size,
            distance_miles: distanceMiles,
            heavy_items: quote.special_items || [],
            scheduled_for: buildScheduledFor(quote.preferred_date, quote.preferred_time),
            stairs_from: hasStairsPU ? (quote.flights_pickup || 1) : 0,
            stairs_to: hasStairsDO ? (quote.flights_dropoff || 1) : 0,
            elevator_from: quote.stairs_pickup === 'Elevator',
            elevator_to: quote.stairs_dropoff === 'Elevator',
            staging: !!quote.staging,
            packing_service: !!quote.packing_service,
            pricing_model: 'flat',
            gig_category: 'moving',
            gig_title: quote.service_type || 'Move',
            quoted_price_cents: total,
            platform_fee_cents,
            mover_payout_cents,
            payout_status: 'unpaid',
            paid_at: new Date().toISOString(),
            referral_code: quote.referral_code || null,
            referral_credit_cents: referralCredit,
            customer_notes: [quote.items_list, quote.other_notes].filter(Boolean).join('\n') || null,
          })
          .select('id')
          .single();

        if (gigErr) {
          console.error('Failed to convert lead to gig:', gigErr.message);
        } else if (newGig) {
          await supabase
            .from('quote_requests')
            .update({ gig_id: newGig.id, status: 'booked' })
            .eq('id', quote.id);
          // Link the referral redemption to the booked gig so completing the gig
          // (trigger) flips the referrer's $20 reward to 'owed'.
          if (quote.referral_code) {
            await supabase.from('referrals').update({ gig_id: newGig.id }).eq('quote_request_id', quote.id);
          }
          console.log(`Lead ${quote.id} converted to gig ${newGig.id}`);
        }
      }

      // Send confirmation email via Resend
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        if (quote?.email) {
          const firstName = quote.name?.split(' ')[0] || 'there';
          const amountPaid = quote.deposit_cents ? `$${(quote.deposit_cents / 100).toFixed(2)}` : '';
          const refNum = quote.lead_number ? `#${quote.lead_number}` : '';

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: 'Fast Fix Work <noreply@fastfixwork.com>',
              to: [quote.email, 'fastfixworkservices@gmail.com', 'fastfixappsupport@gmail.com'],
              subject: `Booking confirmed ${refNum} — Fast Fix Work`,
              html: `
                <div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
                  <div style="text-align:center;margin-bottom:24px;">
                    <span style="font-size:28px;font-weight:800;color:#C98B3F;font-family:'Georgia',serif;">Fast Fix Work</span>
                  </div>
                  <h2 style="color:#1A1714;margin-bottom:4px;">Hey ${firstName}, you're all set!</h2>
                  <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:20px;">
                    Your booking has been confirmed and payment received. Here's a summary:
                  </p>
                  <div style="background:#FAF7F2;border:1.5px solid #E8E0D4;border-radius:12px;padding:20px;margin-bottom:20px;">
                    ${refNum ? `<div style="font-size:13px;color:#C98B3F;font-weight:700;margin-bottom:12px;">Reference ${refNum}</div>` : ''}
                    <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
                      ${quote.service_type ? `<tr><td style="padding:4px 0;color:#888;">Service</td><td style="padding:4px 0;text-align:right;font-weight:600;">${quote.service_type}</td></tr>` : ''}
                      ${quote.items_size ? `<tr><td style="padding:4px 0;color:#888;">Move size</td><td style="padding:4px 0;text-align:right;font-weight:600;">${quote.items_size}</td></tr>` : ''}
                      ${quote.preferred_date ? `<tr><td style="padding:4px 0;color:#888;">Date</td><td style="padding:4px 0;text-align:right;font-weight:600;">${quote.preferred_date}</td></tr>` : ''}
                      ${quote.preferred_time ? `<tr><td style="padding:4px 0;color:#888;">Time</td><td style="padding:4px 0;text-align:right;font-weight:600;">${quote.preferred_time}</td></tr>` : ''}
                      ${quote.pickup_address ? `<tr><td style="padding:4px 0;color:#888;">Pickup</td><td style="padding:4px 0;text-align:right;font-weight:600;">${quote.pickup_address}</td></tr>` : ''}
                      ${quote.dropoff_address ? `<tr><td style="padding:4px 0;color:#888;">Drop-off</td><td style="padding:4px 0;text-align:right;font-weight:600;">${quote.dropoff_address}</td></tr>` : ''}
                      ${amountPaid ? `<tr><td style="padding:8px 0 4px;color:#888;border-top:1px solid #E8E0D4;">Amount paid</td><td style="padding:8px 0 4px;text-align:right;font-weight:800;font-size:16px;color:#1A1714;border-top:1px solid #E8E0D4;">${amountPaid}</td></tr>` : ''}
                    </table>
                  </div>
                  <div style="background:#FFF8E7;border:1.5px solid #C98B3F;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
                    <p style="margin:0;font-size:13px;color:#8B6914;line-height:1.5;">
                      <strong>Cancellation policy:</strong> 80% refundable if cancelled 48+ hours before your move. Non-refundable within 48 hours. Contact us to cancel or reschedule.
                    </p>
                  </div>
                  <p style="color:#555;font-size:14px;line-height:1.6;margin-bottom:8px;">
                    <strong>What happens next:</strong> We'll reach out shortly to confirm the details and assign your crew.
                  </p>
                  <p style="color:#555;font-size:14px;line-height:1.6;margin-bottom:24px;">
                    If anything about your move changes, let us know as soon as possible.
                  </p>
                  <div style="text-align:center;margin-bottom:24px;">
                    <a href="tel:5127771628" style="display:inline-block;background:#C98B3F;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Call or text: 512-777-1628</a>
                  </div>
                  <p style="color:#aaa;font-size:12px;text-align:center;">
                    Fast Fix Work LLC · Austin, TX · Mon–Sat, 7 AM – 9 PM<br>
                    <a href="mailto:communication@fastfixwork.com" style="color:#C98B3F;">communication@fastfixwork.com</a>
                  </p>
                </div>
              `,
            }),
          });
          console.log(`Confirmation email sent to ${quote.email}`);
        }
      }

      // Booking-confirmed text (send #2) — only if the customer opted in on the
      // intake form. Fail-soft: never blocks the webhook.
      if (quote?.sms_consent && quote?.phone) {
        const firstName = quote.name?.split(' ')[0] || 'there';
        const refNum = quote.lead_number ? `#${quote.lead_number}` : '';
        const smsRes = await sendSms(
          quote.phone,
          `Fast Fix Work: ${firstName}, your move${refNum ? ' ' + refNum : ''} is booked and paid in full. ` +
          `We'll confirm the details soon. Call/text 512-777-1628. Reply STOP to opt out.`,
        );
        console.log(`Booking-confirmed SMS for ${quoteId}: ${smsRes.ok}${smsRes.error ? ' err=' + smsRes.error : ''}`);
      }
      console.log(`Quote payment succeeded for ${quoteId}`);
    } else if (gigId) {
      // App gig paid in full by the customer. Record the capture and stamp the
      // gig with paid_at + payout amounts so it's eligible for mover payout
      // (transfer-to-mover) once the job is completed.
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
      console.log(`Payment succeeded for gig ${gigId}`);
    } else {
      console.log('No gig_id or quote_request_id in metadata, skipping');
    }
  }

  if (event.type === 'account.updated') {
    // A mover's Connect account changed (onboarding progress, capability flips).
    // Keep mover_profiles flags in sync so the app and payout guards are accurate.
    const account = event.data.object as Stripe.Account;
    await supabase
      .from('mover_profiles')
      .update({
        charges_enabled: !!account.charges_enabled,
        payouts_enabled: !!account.payouts_enabled,
        stripe_onboarding_complete: !!account.details_submitted,
      })
      .eq('stripe_account_id', account.id);
    console.log(`Connect account ${account.id} updated (payouts_enabled=${account.payouts_enabled})`);
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const gigId = intent.metadata?.gig_id;
    const quoteId = intent.metadata?.quote_request_id;

    if (quoteId) {
      await supabase
        .from('quote_requests')
        .update({ payment_status: 'failed' })
        .eq('stripe_payment_intent_id', intent.id);
      console.log(`Quote payment failed for ${quoteId}`);
    } else if (gigId) {
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('stripe_payment_intent_id', intent.id);
      console.log(`Payment failed for gig ${gigId}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
