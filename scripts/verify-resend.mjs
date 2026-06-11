#!/usr/bin/env node
// Verify the Resend email setup that powers Fast Fix Work confirmation emails.
//
// It does two checks against the LIVE Resend account, using YOUR key:
//   1. Lists your Resend domains + their verification status (is fastfixwork.com
//      "verified"? — required for noreply@fastfixwork.com to actually send).
//   2. (optional) Sends ONE real test email, so you can confirm inbox delivery.
//
// The key is read from the RESEND_API_KEY env var so it never lands in argv /
// shell history. Run it WITHOUT committing your key:
//
//   PowerShell:  $env:RESEND_API_KEY="re_xxx"; node scripts/verify-resend.mjs you@email.com
//   bash:        RESEND_API_KEY=re_xxx node scripts/verify-resend.mjs you@email.com
//
// Omit the email arg to only run the domain check (no send). Node 18+ (global fetch).

const KEY = process.env.RESEND_API_KEY;
const TO = process.argv[2] || null;
const FROM = 'Fast Fix Work <noreply@fastfixwork.com>';
const SENDING_DOMAIN = 'fastfixwork.com';

if (!KEY) {
  console.error('\n✗ RESEND_API_KEY is not set.\n  PowerShell: $env:RESEND_API_KEY="re_xxx"; node scripts/verify-resend.mjs you@email.com\n  bash:       RESEND_API_KEY=re_xxx node scripts/verify-resend.mjs you@email.com\n');
  process.exit(2);
}

const auth = { Authorization: `Bearer ${KEY}` };
let failed = false;

// ── 1. API key valid + domain verified? ──────────────────────────────────────
try {
  const r = await fetch('https://api.resend.com/domains', { headers: auth });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    failed = true;
    console.error(`\n✗ Key rejected by Resend (HTTP ${r.status}): ${body?.message || JSON.stringify(body)}`);
    console.error('  → The deployed functions would silently send nothing. Rotate/re-set RESEND_API_KEY.\n');
  } else {
    const domains = body.data || body || [];
    console.log(`\n✓ API key works. ${domains.length} domain(s) on this Resend account:`);
    let match = null;
    for (const d of domains) {
      const mark = d.status === 'verified' ? '✓' : '⚠';
      console.log(`   ${mark} ${d.name}  —  status: ${d.status}${d.region ? '  (' + d.region + ')' : ''}`);
      if (d.name === SENDING_DOMAIN) match = d;
    }
    if (!match) {
      failed = true;
      console.error(`\n✗ ${SENDING_DOMAIN} is NOT on this account — ${FROM} cannot send. Add + verify it in Resend.`);
    } else if (match.status !== 'verified') {
      failed = true;
      console.error(`\n✗ ${SENDING_DOMAIN} status is "${match.status}", not "verified" — sends will be rejected until DNS verifies.`);
    } else {
      console.log(`\n✓ ${SENDING_DOMAIN} is verified — confirmation emails can send.`);
    }
  }
} catch (e) {
  failed = true;
  console.error(`\n✗ Could not reach Resend API: ${e.message}`);
}

// ── 2. Optional real test send ───────────────────────────────────────────────
if (TO) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: 'Resend verification test — Fast Fix Work',
        html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:28px 20px">
          <div style="text-align:center;margin-bottom:20px"><span style="font-size:26px;font-weight:800;color:#C98B3F;font-family:Georgia,serif">Fast Fix Work</span></div>
          <p style="color:#333;font-size:15px;line-height:1.6">This is a test of the confirmation-email pipeline. If you're reading this in your inbox (not spam), <b>${FROM}</b> is sending correctly.</p>
          <p style="color:#aaa;font-size:12px;text-align:center;margin-top:18px">Fast Fix Work LLC · Austin, TX</p>
        </div>`,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      failed = true;
      console.error(`\n✗ Test send to ${TO} failed (HTTP ${r.status}): ${body?.message || JSON.stringify(body)}`);
    } else {
      console.log(`\n✓ Test email queued to ${TO} (Resend id: ${body.id}). Check the inbox + spam, and Resend → Logs for delivery status.`);
    }
  } catch (e) {
    failed = true;
    console.error(`\n✗ Test send error: ${e.message}`);
  }
} else {
  console.log('\n(no recipient passed — skipped the test send. Add an email arg to send one.)');
}

console.log('');
process.exit(failed ? 1 : 0);
