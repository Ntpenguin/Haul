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
    .select('push_token')
    .eq('id', record.id)
    .single();

  if (!profile?.push_token) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no push token' }), { status: 200 });
  }

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: profile.push_token,
      title: "You're approved! 🎉",
      body: 'Start browsing available jobs and earn money today.',
      data: { role: 'mover' },
    }),
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
