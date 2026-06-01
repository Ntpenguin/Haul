import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const payload = await req.json();
  const { record, old_record } = payload;

  // Only fire when status changes TO approved
  if (record?.status !== 'approved' || old_record?.status === 'approved') {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: profile } = await adminClient
    .from('profiles')
    .select('push_token, email, full_name')
    .eq('id', record.id)
    .single();

  // Push notification
  if (profile?.push_token) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.push_token,
        title: "You're approved!",
        body: 'Start browsing available jobs and earn money today.',
        data: { role: 'mover' },
      }),
    });
  }

  // Email notification via Resend
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (resendKey && profile?.email) {
    const firstName = profile.full_name?.split(' ')[0] || 'there';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Fast Fix Work <noreply@fastfixwork.com>',
        to: profile.email,
        subject: "You're approved to start earning!",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;">
            <h2 style="color:#C98B3F;margin-bottom:8px;">Hey ${firstName}, you're in!</h2>
            <p style="color:#333;font-size:16px;line-height:1.5;margin-bottom:24px;">
              Your Fast Fix Work application has been approved. You can now log in to the app and start browsing available jobs in your area.
            </p>
            <p style="color:#333;font-size:15px;margin-bottom:8px;"><strong>What's next:</strong></p>
            <ul style="color:#555;font-size:15px;line-height:1.8;padding-left:20px;margin-bottom:24px;">
              <li>Open the Fast Fix Work app</li>
              <li>Toggle yourself online</li>
              <li>Browse and apply to jobs near you</li>
            </ul>
            <p style="color:#888;font-size:13px;">Questions? Call us: 512-777-1628 (Mon–Sat, 7 AM – 9 PM)</p>
          </div>
        `,
      }),
    });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
