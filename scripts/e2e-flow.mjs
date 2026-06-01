#!/usr/bin/env node
// End-to-end flow trace against the live Supabase project.
//
// What it does (creates real rows, then deletes them all at the end):
//   1. Creates 3 confirmed auth users: a customer, a worker (mover), an admin.
//   2. Marks the worker's profile role='mover' + an approved mover_profiles row.
//   3. Seeds the admin into the `admins` allow-list (migration 034).
//   4. FLOW A (in-app gig): customer posts a gig -> worker applies -> accept
//      (simulates customer accept) -> matched -> simulate the Stripe webhook
//      (paid_at + payout amounts + in_progress) -> worker marks complete.
//   5. FLOW B (lead-sourced gig): inserts a PAID lead gig (customer_id NULL,
//      paid_at set, like stripe-webhook conversion) -> worker applies -> signs
//      in as the admin and calls the assign_mover_to_gig RPC -> verifies the gig
//      jumped to in_progress with mover_id set -> worker marks complete.
//   6. Cleanup: deletes every row it created (FK order) + the 3 auth users.
//
// It does NOT execute a real Stripe charge or a real Connect transfer (those
// need a card sheet / a connected account and can't run headless). It verifies
// the DB + RLS + RPC flow that those webhooks/functions drive.
//
// Run (Stripe is irrelevant here — this only touches Supabase):
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/e2e-flow.mjs
// URL + anon key are read from .env automatically; or override via env:
//   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env (simple parser; only for URL + anon key) ─────────────────
function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env optional */ }
  return env;
}

const env = loadEnv();
const URL = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE) {
  console.error('Missing config. Need EXPO_PUBLIC_SUPABASE_URL (from .env) and SUPABASE_SERVICE_ROLE_KEY (pass as env var).');
  process.exit(1);
}
if (!ANON) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY (needed to sign in as the admin to test the RPC under auth.uid()).');
  process.exit(1);
}

// Service-role client bypasses RLS — used for setup, simulation, and cleanup.
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const stamp = Date.now();
const PW = 'Test!' + stamp + 'aA';
const emails = {
  customer: `e2e.customer.${stamp}@fastfixwork-e2e.test`,
  worker: `e2e.worker.${stamp}@fastfixwork-e2e.test`,
  admin: `e2e.admin.${stamp}@fastfixwork-e2e.test`,
};

const created = { users: [], gigs: [], apps: [] };
let pass = 0, fail = 0;
const ok = (label, cond) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}`); } };

async function makeUser(email, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const id = data.user.id;
  created.users.push(id);
  // handle_new_user() trigger inserts a profiles row; set role/name on it.
  await admin.from('profiles').update({ role, full_name: `E2E ${role}` }).eq('id', id);
  return id;
}

async function run() {
  console.log('\n=== FFW end-to-end flow trace ===\n');

  // 1–3. Users + approvals + admin seed
  console.log('Setup: users, mover approval, admin allow-list');
  const customerId = await makeUser(emails.customer, 'customer');
  const workerId = await makeUser(emails.worker, 'mover');
  const adminId = await makeUser(emails.admin, 'customer');

  await admin.from('mover_profiles').upsert({
    id: workerId, status: 'approved', vehicle_type: 'truck',
    background_check_status: 'clear', service_area_zip: ['78701'], skills: ['moving'],
  });
  const { data: mp } = await admin.from('mover_profiles').select('status').eq('id', workerId).single();
  ok('worker mover_profile approved', mp?.status === 'approved');

  await admin.from('admins').upsert({ user_id: adminId });
  const { data: ad } = await admin.from('admins').select('user_id').eq('user_id', adminId).single();
  ok('admin seeded into allow-list', ad?.user_id === adminId);

  // ── FLOW A: in-app gig ──────────────────────────────────────────────
  console.log('\nFLOW A — in-app gig (customer posts, accept, pay, complete)');
  const priceA = 50000;
  const { data: gigA, error: gigAErr } = await admin.from('gigs').insert({
    customer_id: customerId, status: 'posted', from_address: '100 Congress Ave, Austin',
    to_address: '200 E 6th St, Austin', home_size: '1bed', crew_size: 1, pricing_model: 'flat',
    gig_category: 'moving', gig_title: 'E2E app move', quoted_price_cents: priceA,
  }).select('id').single();
  if (gigAErr) throw new Error('create gig A: ' + gigAErr.message);
  created.gigs.push(gigA.id);
  ok('gig A posted', !!gigA.id);

  const { data: appA } = await admin.from('gig_applications').insert({
    gig_id: gigA.id, mover_id: workerId, status: 'pending', message: 'On it', slots_claimed: 1,
  }).select('id').single();
  created.apps.push(appA.id);
  ok('worker applied to gig A', !!appA.id);

  // Simulate customer accept (RLS path: customer updates own gig's application)
  await admin.from('gig_applications').update({ status: 'accepted', is_lead: true }).eq('id', appA.id);
  await admin.from('gigs').update({ status: 'matched', mover_id: workerId, matched_at: new Date().toISOString() }).eq('id', gigA.id);
  let { data: gA } = await admin.from('gigs').select('status, mover_id').eq('id', gigA.id).single();
  ok('gig A matched + mover assigned', gA?.status === 'matched' && gA?.mover_id === workerId);

  // Simulate stripe-webhook payment_intent.succeeded for an app gig
  const feeA = Math.round(priceA * 0.15);
  await admin.from('gigs').update({
    status: 'in_progress', paid_at: new Date().toISOString(),
    platform_fee_cents: feeA, mover_payout_cents: priceA - feeA, payout_status: 'unpaid',
  }).eq('id', gigA.id).eq('status', 'matched');
  ({ data: gA } = await admin.from('gigs').select('status, paid_at, mover_payout_cents').eq('id', gigA.id).single());
  ok('gig A in_progress after (simulated) payment', gA?.status === 'in_progress' && !!gA?.paid_at);
  ok('gig A payout amount stamped (85%)', gA?.mover_payout_cents === priceA - feeA);

  // Worker completes
  await admin.from('gigs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', gigA.id);
  ({ data: gA } = await admin.from('gigs').select('status').eq('id', gigA.id).single());
  ok('gig A completed', gA?.status === 'completed');

  // ── FLOW B: lead-sourced gig + admin assign RPC ─────────────────────
  console.log('\nFLOW B — lead-sourced gig (paid web lead, admin assign RPC, complete)');
  const priceB = 80000;
  const feeB = Math.round(priceB * 0.15);
  // Mirror stripe-webhook lead->gig conversion: customer_id NULL, already paid.
  const { data: gigB } = await admin.from('gigs').insert({
    customer_id: null, status: 'posted', from_address: '300 W 6th St, Austin',
    to_address: '400 Nueces St, Austin', home_size: '2bed', pricing_model: 'flat',
    gig_category: 'moving', gig_title: 'E2E lead move', quoted_price_cents: priceB,
    platform_fee_cents: feeB, mover_payout_cents: priceB - feeB,
    payout_status: 'unpaid', paid_at: new Date().toISOString(),
  }).select('id').single();
  created.gigs.push(gigB.id);
  ok('lead gig B posted (customer_id NULL, paid)', !!gigB.id);

  const { data: appB } = await admin.from('gig_applications').insert({
    gig_id: gigB.id, mover_id: workerId, status: 'pending', message: 'Can do', slots_claimed: 1,
  }).select('id').single();
  created.apps.push(appB.id);
  ok('worker applied to lead gig B', !!appB.id);

  // Sign in as the admin (anon client) so auth.uid() resolves inside the RPC.
  const adminClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signErr } = await adminClient.auth.signInWithPassword({ email: emails.admin, password: PW });
  ok('admin signed in', !signErr);

  const { error: rpcErr } = await adminClient.rpc('assign_mover_to_gig', { p_gig_id: gigB.id, p_application_id: appB.id });
  ok('assign_mover_to_gig RPC succeeded', !rpcErr);
  if (rpcErr) console.error('    rpc error:', rpcErr.message);

  const { data: gB } = await admin.from('gigs').select('status, mover_id').eq('id', gigB.id).single();
  ok('lead gig B -> in_progress (paid gig promoted on assign)', gB?.status === 'in_progress');
  ok('lead gig B mover assigned', gB?.mover_id === workerId);
  const { data: appBnow } = await admin.from('gig_applications').select('status, is_lead').eq('id', appB.id).single();
  ok('lead gig B application accepted + is_lead', appBnow?.status === 'accepted' && appBnow?.is_lead === true);

  // Negative check: a non-admin must NOT be able to call the RPC.
  const workerClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await workerClient.auth.signInWithPassword({ email: emails.worker, password: PW });
  const { error: denyErr } = await workerClient.rpc('assign_mover_to_gig', { p_gig_id: gigB.id, p_application_id: appB.id });
  ok('non-admin blocked from assign RPC', !!denyErr);

  // Worker completes the lead gig
  await admin.from('gigs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', gigB.id);
  const { data: gBdone } = await admin.from('gigs').select('status, paid_at, mover_payout_cents, payout_status').eq('id', gigB.id).single();
  ok('lead gig B completed', gBdone?.status === 'completed');
  ok('lead gig B payout-ready (paid_at + payout amount + unpaid)',
    !!gBdone?.paid_at && gBdone?.mover_payout_cents === priceB - feeB && gBdone?.payout_status === 'unpaid');

  await adminClient.auth.signOut();
  await workerClient.auth.signOut();
}

async function cleanup() {
  console.log('\nCleanup: removing all test rows + auth users');
  for (const id of created.apps) await admin.from('gig_applications').delete().eq('id', id);
  for (const id of created.gigs) {
    await admin.from('payments').delete().eq('gig_id', id);
    await admin.from('gig_photos').delete().eq('gig_id', id);
    await admin.from('gig_applications').delete().eq('gig_id', id);
    await admin.from('mover_locations').delete().eq('gig_id', id);
    await admin.from('gigs').delete().eq('id', id);
  }
  // Deleting the auth user cascades profiles, mover_profiles, and the admins row.
  for (const id of created.users) {
    await admin.from('admins').delete().eq('user_id', id);
    await admin.from('mover_profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log('  ✓ cleanup done');
}

(async () => {
  try {
    await run();
  } catch (e) {
    fail++;
    console.error('\nFATAL:', e.message);
  } finally {
    await cleanup().catch((e) => console.error('cleanup error:', e.message));
    console.log(`\n=== Result: ${pass} passed, ${fail} failed ===\n`);
    process.exit(fail ? 1 : 0);
  }
})();
