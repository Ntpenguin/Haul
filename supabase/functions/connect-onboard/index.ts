// Supabase Edge Function — creates (or reuses) a Stripe Connect Express account
// for a mover and returns an onboarding link. The mover completes KYC / payout
// setup on Stripe's hosted flow, after which connect-status syncs the flags.
//
// Deploy: supabase functions deploy connect-onboard
// Secrets: STRIPE_SECRET_KEY, plus CONNECT_RETURN_URL / CONNECT_REFRESH_URL (optional)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Where Stripe sends the mover after finishing / refreshing onboarding. These are
// deep links handled by the app; fall back to the marketing site.
const RETURN_URL = Deno.env.get('CONNECT_RETURN_URL') || 'https://fastfixwork.com/connect/return';
const REFRESH_URL = Deno.env.get('CONNECT_REFRESH_URL') || 'https://fastfixwork.com/connect/refresh';

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

    // The mover_profiles row id is the same as the auth user id.
    const { data: mover, error: moverErr } = await supabase
      .from('mover_profiles')
      .select('id, stripe_account_id')
      .eq('id', user.id)
      .single();
    if (moverErr || !mover) return new Response(JSON.stringify({ error: 'Mover profile not found' }), { status: 404, headers });

    let accountId = mover.stripe_account_id;

    // Create an Express connected account if the mover doesn't have one yet.
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata: { mover_id: user.id },
      });
      accountId = account.id;
      await supabase.from('mover_profiles').update({ stripe_account_id: accountId }).eq('id', user.id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: REFRESH_URL,
      return_url: RETURN_URL,
      type: 'account_onboarding',
    });

    return new Response(JSON.stringify({ url: link.url, account_id: accountId }), { status: 200, headers });
  } catch (err: any) {
    console.error('connect-onboard error:', err);
    return new Response(JSON.stringify({ error: 'Onboarding failed' }), { status: 500, headers });
  }
});
