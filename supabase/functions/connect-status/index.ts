// Supabase Edge Function — syncs a mover's Stripe Connect account flags
// (charges_enabled, payouts_enabled, details_submitted) into mover_profiles and
// returns the current status. Called by the app after the mover returns from
// the Stripe onboarding flow, or to poll readiness before a payout.
//
// Deploy: supabase functions deploy connect-status
// Secrets: STRIPE_SECRET_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    const { data: mover, error: moverErr } = await supabase
      .from('mover_profiles')
      .select('id, stripe_account_id')
      .eq('id', user.id)
      .single();
    if (moverErr || !mover) return new Response(JSON.stringify({ error: 'Mover profile not found' }), { status: 404, headers });

    if (!mover.stripe_account_id) {
      return new Response(JSON.stringify({ connected: false, charges_enabled: false, payouts_enabled: false, details_submitted: false }), { status: 200, headers });
    }

    const account = await stripe.accounts.retrieve(mover.stripe_account_id);
    const charges_enabled = !!account.charges_enabled;
    const payouts_enabled = !!account.payouts_enabled;
    const details_submitted = !!account.details_submitted;

    await supabase
      .from('mover_profiles')
      .update({ charges_enabled, payouts_enabled, stripe_onboarding_complete: details_submitted })
      .eq('id', user.id);

    return new Response(
      JSON.stringify({ connected: true, charges_enabled, payouts_enabled, details_submitted }),
      { status: 200, headers },
    );
  } catch (err: any) {
    console.error('connect-status error:', err);
    return new Response(JSON.stringify({ error: 'Status check failed' }), { status: 500, headers });
  }
});
