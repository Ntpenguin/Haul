import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { TtsProvider, VoiceInfo } from '../types.js';

const log = logger('tts:elevenlabs');

/**
 * ElevenLabs streaming TTS. We request `output_format=ulaw_8000`, which is exactly
 * what Twilio Media Streams expects — no resampling or transcoding needed.
 */
export class ElevenLabsTts implements TtsProvider {
  async *synthesize(text: string, voiceId?: string): AsyncGenerator<Buffer> {
    const voice = voiceId || config.elevenlabs.voiceId;
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=ulaw_8000&optimize_streaming_latency=3`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenlabs.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/basic',
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenlabs.model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
      }),
    });

    if (!res.ok || !res.body) {
      log.error(`HTTP ${res.status}`, await res.text().catch(() => ''));
      return;
    }
    // Node's fetch body is an async-iterable of Uint8Array chunks.
    for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
      yield Buffer.from(chunk);
    }
  }

  async listVoices(): Promise<VoiceInfo[]> {
    if (!config.elevenlabs.apiKey) return [];
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': config.elevenlabs.apiKey },
      });
      if (!res.ok) {
        log.warn(`listVoices HTTP ${res.status}`);
        return [];
      }
      const data = (await res.json()) as any;
      return (data.voices ?? []).map((v: any) => ({
        id: v.voice_id,
        name: v.name,
        preview_url: v.preview_url,
        description: [v.labels?.accent, v.labels?.gender, v.labels?.description].filter(Boolean).join(' · '),
      }));
    } catch (e) {
      log.error('listVoices failed', e);
      return [];
    }
  }
}
