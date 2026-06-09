import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { TtsProvider } from '../types.js';

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
}
