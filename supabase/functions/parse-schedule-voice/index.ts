// Edge function: transcribe voice recording + parse into schedule/job fields
// Deploy: supabase functions deploy parse-schedule-voice
// Secrets needed:
//   supabase secrets set OPENAI_API_KEY=sk-...
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': 'https://fastfixwork.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Parse the uploaded audio from FormData
    const form = await req.formData();
    const audioFile = form.get('audio') as File | null;
    if (!audioFile) {
      return new Response(JSON.stringify({ error: 'No audio file provided' }), { status: 400, headers: CORS });
    }

    // Step 1: Transcribe with OpenAI Whisper
    const whisperForm = new FormData();
    whisperForm.append('file', audioFile, audioFile.name || 'voice.m4a');
    whisperForm.append('model', 'whisper-1');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.error('Whisper error:', err);
      return new Response(JSON.stringify({ error: 'Transcription failed' }), { status: 500, headers: CORS });
    }

    const { text: transcript } = await whisperRes.json();
    if (!transcript) {
      return new Response(JSON.stringify({ error: 'Empty transcription' }), { status: 400, headers: CORS });
    }

    // Step 2: Parse with Claude — extract date/time, title, description
    const today = new Date().toISOString();
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Extract job scheduling details from this voice message and return ONLY valid JSON (no markdown, no extra text).

Today's date/time (UTC): ${today}

Return this exact structure:
{
  "scheduled_for": "<ISO 8601 datetime string, or null if unspecified/ASAP>",
  "title": "<concise job title, max 50 chars>",
  "description": "<full job description from the message>",
  "gig_category": "<one of: moving, cleaning, landscaping, auto — infer from context, default to moving>"
}

Rules:
- Interpret relative dates (tomorrow, next Monday, this weekend) relative to today
- Times like "morning" = 9am, "afternoon" = 2pm, "evening" = 6pm
- If no time mentioned, use null for scheduled_for
- Title should summarize the job in 3-6 words

Voice message: "${transcript}"`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('Claude error:', err);
      return new Response(JSON.stringify({ error: 'Parsing failed' }), { status: 500, headers: CORS });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '{}';

    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Try to extract JSON from the response if it has surrounding text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    return new Response(
      JSON.stringify({
        transcript,
        scheduled_for: parsed.scheduled_for || null,
        title: parsed.title || null,
        description: parsed.description || null,
        gig_category: parsed.gig_category || 'moving',
      }),
      { status: 200, headers: CORS },
    );
  } catch (err: any) {
    console.error('parse-schedule-voice error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: CORS });
  }
});
