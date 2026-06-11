// Shared: accept a business job → ensure an UNPAID gig exists, create a Stripe
// Checkout pay-link for the agreed price, email it to the business, and mark the
// job booked/unpaid. Imported by submit-business-job (auto-accept) AND
// bill-business-job (admin manual) so the logic lives in exactly one place.

const PLATFORM_FEE_PERCENT = 15;
const escHtml = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function billBusinessJob(svc: any, stripe: any, resendKey: string | undefined, jobId: string) {
  const { data: job, error } = await svc.from('business_jobs').select('*').eq('id', jobId).single();
  if (error || !job) throw new Error('Business job not found');

  const price = job.counter_price_cents || job.offered_price_cents || job.recommended_price_cents || 0;
  if (price < 50) throw new Error('No valid price to bill');
  const stops = Array.isArray(job.stops) ? job.stops.filter((s: any) => s && s.addr) : [];

  // Ensure a gig exists (UNPAID — paid_at stays null until they pay).
  let gigId = job.gig_id as string | null;
  if (!gigId) {
    const fee = Math.round(price * (PLATFORM_FEE_PERCENT / 100));
    const stopNotes = stops.length > 2 ? 'Stops:\n' + stops.map((s: any, i: number) => `  ${i + 1}. ${s.addr}`).join('\n') : null;
    const { data: gig, error: gErr } = await svc.from('gigs').insert({
      customer_id: null, status: 'posted',
      from_address: stops[0]?.addr || 'Address to confirm',
      to_address: stops[stops.length - 1]?.addr || stops[0]?.addr || 'Address to confirm',
      distance_miles: job.distance_miles, home_size: job.job_size,
      heavy_items: Array.isArray(job.special_items) ? job.special_items : [],
      scheduled_for: job.scheduled_for, stairs_from: job.stairs ? 1 : 0,
      elevator_from: !!job.elevator, long_carry: !!job.long_walk,
      pricing_model: 'flat', gig_category: 'moving', gig_title: `Business job #${job.job_number}`,
      quoted_price_cents: price, platform_fee_cents: fee, mover_payout_cents: price - fee,
      payout_status: 'unpaid', paid_at: null,
      customer_notes: [stopNotes, job.notes].filter(Boolean).join('\n') || null,
    }).select('id').single();
    if (gErr || !gig) throw new Error('Could not create gig: ' + (gErr?.message || ''));
    gigId = gig.id;
  }

  const email = String(job.customer_email || '').trim();
  const meta = { type: 'business_job', business_job_id: job.id, gig_id: gigId };
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd', unit_amount: price,
        product_data: { name: `Fast Fix Work — Business job #${job.job_number}`, description: stops.map((s: any) => s.addr).join(' → ') || 'Moving job' },
      },
    }],
    payment_intent_data: { metadata: meta },
    metadata: meta,
    success_url: 'https://fastfixwork.com/surcharge-paid.html',
    cancel_url: 'https://fastfixwork.com/',
  });

  await svc.from('business_jobs').update({
    status: 'booked', decision: 'accepted', payment_status: 'unpaid',
    gig_id: gigId, stripe_checkout_session_id: session.id, decided_at: new Date().toISOString(),
  }).eq('id', job.id);

  if (resendKey && session.url) {
    const recipients = ['fastfixworkservices@gmail.com', 'fastfixappsupport@gmail.com'];
    if (email) recipients.unshift(email);
    const amountStr = `$${(price / 100).toFixed(2)}`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Fast Fix Work <noreply@fastfixwork.com>',
        to: recipients,
        subject: `Job #${job.job_number} accepted — pay to confirm — Fast Fix Work`,
        html: `<div style="font-family:'Inter',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
          <div style="text-align:center;margin-bottom:24px;"><span style="font-size:28px;font-weight:800;color:#C98B3F;font-family:Georgia,serif;">Fast Fix Work</span></div>
          <h2 style="color:#1A1714;margin-bottom:4px;">Hi ${escHtml(job.customer_name || 'there')}, your job is accepted</h2>
          <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:16px;">Job <b>#${job.job_number}</b> is confirmed at <strong>${amountStr}</strong>. Pay below to lock in your spot${job.scheduled_for ? ' for ' + new Date(job.scheduled_for).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}.</p>
          <div style="text-align:center;margin-bottom:24px;"><a href="${session.url}" style="display:inline-block;background:#C98B3F;color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Pay ${amountStr} &amp; confirm</a></div>
          <p style="color:#888;font-size:13px;line-height:1.6;">Questions? Call or text <a href="tel:5127771628" style="color:#C98B3F;font-weight:600;">512-777-1628</a>.</p>
          <p style="color:#aaa;font-size:12px;text-align:center;margin-top:20px;">Fast Fix Work LLC · Austin, TX</p>
        </div>`,
      }),
    });
  }

  return { url: session.url, gig_id: gigId, job_number: job.job_number };
}
