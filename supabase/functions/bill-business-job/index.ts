// bill-business-job — admin "Book" entry point. Authorizes (admin user OR an
// internal service-role call), then runs the shared billBusinessJob() which
// creates the UNPAID gig + Stripe pay-link + emails the business.
//
// Deploy WITHOUT --no-verify-jwt (admin JWT + service-role JWT are both valid):
//   npx supabase functions deploy bill-business-job --project-ref joiukvttuamaanrgzfrz

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';
import { billBusinessJob } from '../_shared/bizbill.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const ALLOWED_ORIGINS = ['https://fastfixwork.com', 'http://localhost:3001', 'http://127.0.0.1:3001'];

serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://fastfixwork.com';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  try {
    const auth = req.headers.get('Authorization') || '';
    // Authorize: internal/service call (JWT role = service_role) OR an admin user.
    const roleFromJwt = (() => {
      try {
        const part = auth.replace(/^Bearer\s+/i, '').split('.')[1];
        if (!part) return null;
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const pad = '='.repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(atob(b64 + pad)).role || null;
      } catch { return null; }
    })();
    let authorized = roleFromJwt === 'service_role';
    if (!authorized) {
      const authed = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: isAdmin } = await authed.rpc('is_admin');
      authorized = isAdmin === true;
    }
    if (!authorized) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });

    const { business_job_id } = await req.json();
    if (!business_job_id) return new Response(JSON.stringify({ error: 'business_job_id required' }), { status: 400, headers });

    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const result = await billBusinessJob(svc, stripe, Deno.env.get('RESEND_API_KEY'), business_job_id);
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (err) {
    console.error('bill-business-job error:', err);
    return new Response(JSON.stringify({ error: String((err as Error)?.message || 'Could not bill business job') }), { status: 500, headers });
  }
});
