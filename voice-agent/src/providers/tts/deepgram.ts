import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { TtsProvider, VoiceInfo } from '../types.js';

// Deepgram Aura voices (fixed catalog; there is no list endpoint).
const AURA_VOICES: VoiceInfo[] = [
  { id: 'aura-asteria-en', name: 'Asteria', description: 'US · female' },
  { id: 'aura-luna-en', name: 'Luna', description: 'US · female' },
  { id: 'aura-stella-en', name: 'Stella', description: 'US · female' },
  { id: 'aura-athena-en', name: 'Athena', description: 'UK · female' },
  { id: 'aura-hera-en', name: 'Hera', description: 'US · female' },
  { id: 'aura-orion-en', name: 'Orion', description: 'US · male' },
  { id: 'aura-arcas-en', name: 'Arcas', description: 'US · male' },
  { id: 'aura-perseus-en', name: 'Perseus', description: 'US · male' },
  { id: 'aura-angus-en', name: 'Angus', description: 'Ireland · male' },
  { id: 'aura-orpheus-en', name: 'Orpheus', description: 'US · male' },
  { id: 'aura-helios-en', name: 'Helios', description: 'UK · male' },
  { id: 'aura-zeus-en', name: 'Zeus', description: 'US · male' },
];

const log = logger('tts:deepgram');

/** Deepgram Aura TTS. Outputs μ-law/8kHz for Twilio. Cheaper alternative to ElevenLabs. */
export class DeepgramTts implements TtsProvider {
  async *synthesize(text: string, voiceId?: string): AsyncGenerator<Buffer> {
    const model = voiceId || config.deepgram.ttsModel;
    const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mulaw&sample_rate=8000&container=none`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.deepgram.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok || !res.body) {
      log.error(`HTTP ${res.status}`, await res.text().catch(() => ''));
      return;
    }
    for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
      yield Buffer.from(chunk);
    }
  }

  async listVoices(): Promise<VoiceInfo[]> {
    return AURA_VOICES;
  }
}
