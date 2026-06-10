// register-mover — create a mover account from the public web signup form OR the
// admin "Add worker" modal. Both surfaces POST the SAME payload here.
//
// Why an edge function (service role)? Writing `profiles` / `mover_profiles`
// requires an authenticated session (RLS: auth.uid() = id), but a web signup has
// no session until email-OTP verification. So we create the auth user + write
// both tables server-side with the service role, mirroring app/(auth)/mover-signup.tsx.
// The new row lands in mover_profiles with status='pending' → shows in the admin
// "Workers" tab automatically (no movers-query change needed).
//
// Selfie: the client uploads it to the anon-writable `quote-photos` bucket first
// (same path the intake/business forms use) and passes the public URL here.
//
// Deploy (anon-callable, public form):
//   npx supabase functions deploy register-mover --no-verify-jwt --project-ref joiukvttuamaanrgzfrz

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://fastfixwork.com', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];

// Mirrors lib/validate.ts so the form, the app, and the server agree.
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const isValidPhone = (p: string) => p.replace(/\D/g, '').length === 10;
const isValidPassword = (p: string) =>
  p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
const isValidName = (n: string) => n.trim().length >= 1 && /^[a-zA-Z\s\-']+$/.test(n.trim());

const VEHICLE_TYPES = ['own-truck', 'own-van', 'muscle', 'rent'];
const ACCOUNT_TYPES = ['independent', 'business'];
// Mirrors ALL_SKILLS keys in app/(auth)/mover-signup.tsx.
const VALID_SKILLS = new Set([
  'packing', 'box-truck', 'furniture-assembly', 'tv-mounting', 'junk-removal', 'towing',
  'cleaning', 'landscaping', 'upholstery', 'remodeling', 'construction', 'hauling', 'painting', 'flooring',
]);

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
    const body = await req.json();
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Rate-limit per IP (fail open if the limiter RPC is unavailable). Mirrors
    // create-quote-payment: trust cf-connecting-ip, then the RIGHTMOST x-forwarded-for.
    const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean).pop();
    const clientIp = req.headers.get('cf-connecting-ip') || xff || 'unknown';
    const rl = await svc.rpc('check_rate_limit', { p_bucket: 'register-mover:ip', p_key: clientIp, p_max: 10, p_window_seconds: 3600 });
    if (!rl.error && rl.data === false) {
      return new Response(JSON.stringify({ error: 'Too many signups from this network. Please call 512-777-1628.' }), { status: 429, headers });
    }

    // ── Validate / normalize input (mirrors validateMoverStep in the app) ──────
    const firstName = String(body.first_name || '').trim().slice(0, 60);
    const lastName = String(body.last_name || '').trim().slice(0, 60);
    const phone = String(body.phone || '').trim().slice(0, 20);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
    const password = String(body.password || '');
    const accountType = ACCOUNT_TYPES.includes(body.account_type) ? body.account_type : 'independent';
    const businessName = String(body.business_name || '').trim().slice(0, 120);
    const address = String(body.address || '').trim().slice(0, 240);
    const vehicleType = VEHICLE_TYPES.includes(body.vehicle_type) ? body.vehicle_type : null;
    const vehicleMakeModel = String(body.vehicle_make_model || '').trim().slice(0, 80);
    const bio = String(body.bio || '').trim().slice(0, 1000);
    const selfieUrl = String(body.selfie_url || '').trim().slice(0, 500) || null;
    const yearsRaw = parseInt(body.years_experience, 10);
    const yearsExperience = Number.isFinite(yearsRaw) && yearsRaw >= 0 ? Math.min(yearsRaw, 80) : null;
    const skills = Array.isArray(body.skills) ? body.skills.filter((s: string) => VALID_SKILLS.has(s)).slice(0, 20) : [];
    const zips = String(body.service_zips || '')
      .split(',').map((z: string) => z.trim()).filter((z: string) => /^\d{5}$/.test(z)).slice(0, 40);

    if (!isValidName(firstName)) return new Response(JSON.stringify({ error: 'Enter a valid first name.' }), { status: 400, headers });
    if (!isValidName(lastName)) return new Response(JSON.stringify({ error: 'Enter a valid last name.' }), { status: 400, headers });
    if (!isValidPhone(phone)) return new Response(JSON.stringify({ error: 'Enter a valid 10-digit phone number.' }), { status: 400, headers });
    if (!isValidEmail(email)) return new Response(JSON.stringify({ error: 'Enter a valid email address.' }), { status: 400, headers });
    if (!isValidPassword(password)) return new Response(JSON.stringify({ error: 'Password must be 8+ characters with upper, lower, number, and symbol.' }), { status: 400, headers });
    if (accountType === 'business' && !businessName) return new Response(JSON.stringify({ error: 'Enter your business name.' }), { status: 400, headers });
    if (!vehicleType) return new Response(JSON.stringify({ error: 'Select a vehicle option.' }), { status: 400, headers });
    if (vehicleType !== 'muscle' && !vehicleMakeModel) return new Response(JSON.stringify({ error: 'Enter your vehicle make and model.' }), { status: 400, headers });
    if (zips.length < 1) return new Response(JSON.stringify({ error: 'Enter at least one valid ZIP code.' }), { status: 400, headers });

    // ── Phone uniqueness (profiles.phone is UNIQUE — pre-check for a friendly error) ─
    const { data: phoneHit } = await svc.from('profiles').select('id').eq('phone', phone).maybeSingle();
    if (phoneHit) {
      return new Response(JSON.stringify({ error: 'An account with this phone number already exists. Try signing in to the app instead.' }), { status: 409, headers });
    }

    // ── Create the auth user (auto-confirmed so they can sign in immediately;
    //    admin still gates them via mover_profiles.status pending→approved). ──────
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${firstName} ${lastName}`.trim(), role: 'mover' },
    });
    if (createErr || !created?.user) {
      const msg = (createErr?.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        return new Response(JSON.stringify({ error: 'An account with this email already exists. Try signing in to the app instead.' }), { status: 409, headers });
      }
      console.error('createUser failed:', createErr?.message);
      return new Response(JSON.stringify({ error: 'Could not create the account. Please try again.' }), { status: 500, headers });
    }
    const userId = created.user.id;

    // handle_new_user() (migration 001) already inserted the profiles row.
    // Promote it to a mover + fill contact fields + selfie as the avatar.
    const { error: profErr } = await svc.from('profiles').upsert({
      id: userId,
      role: 'mover',
      full_name: `${firstName} ${lastName}`.trim() || null,
      phone: phone || null,
      email: email || null,
      ...(selfieUrl ? { avatar_url: selfieUrl } : {}),
    }, { onConflict: 'id' });
    if (profErr) {
      console.error('profiles upsert failed:', profErr.message);
      await svc.auth.admin.deleteUser(userId).catch(() => {}); // roll back the orphaned auth user
      return new Response(JSON.stringify({ error: 'Could not save your profile. Please try again.' }), { status: 500, headers });
    }

    const { error: moverErr } = await svc.from('mover_profiles').upsert({
      id: userId,
      status: 'pending',
      vehicle_type: vehicleType,
      vehicle_make_model: vehicleMakeModel || null,
      service_area_zip: zips,
      bio: bio || null,
      selfie_url: selfieUrl,
      years_experience: yearsExperience,
      skills,
      address: address || null,
      account_type: accountType,
      business_name: accountType === 'business' ? businessName : null,
    }, { onConflict: 'id' });
    if (moverErr) {
      console.error('mover_profiles upsert failed:', moverErr.message);
      await svc.auth.admin.deleteUser(userId).catch(() => {});
      return new Response(JSON.stringify({ error: 'Could not save your worker profile. Please try again.' }), { status: 500, headers });
    }

    console.log(`register-mover: created pending mover ${userId} (${email})`);
    return new Response(JSON.stringify({ ok: true, user_id: userId, status: 'pending' }), { status: 200, headers });
  } catch (err) {
    console.error('register-mover error:', err);
    return new Response(JSON.stringify({ error: 'Could not complete signup. Please try again.' }), { status: 500, headers });
  }
});
