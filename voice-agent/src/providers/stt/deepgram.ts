import WebSocket from 'ws';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { SttEvents, SttProvider, SttStream } from '../types.js';

const log = logger('stt:deepgram');

/**
 * Deepgram streaming STT over WebSocket.
 * We send Twilio's native μ-law/8kHz straight through (encoding=mulaw&sample_rate=8000),
 * and rely on Deepgram endpointing + utterance_end for turn detection.
 */
export class DeepgramStt implements SttProvider {
  async open(events: SttEvents, opts?: { language?: string }): Promise<SttStream> {
    const params = new URLSearchParams({
      model: config.deepgram.sttModel,
      language: opts?.language || 'en',
      encoding: 'mulaw',
      sample_rate: '8000',
      channels: '1',
      punctuate: 'true',
      smart_format: 'true',
      interim_results: 'true',
      endpointing: '300',
      utterance_end_ms: '1000',
      vad_events: 'true',
    });
    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Token ${config.deepgram.apiKey}` } });

    let open = false;
    const queue: Buffer[] = [];

    ws.on('open', () => {
      open = true;
      for (const b of queue) ws.send(b);
      queue.length = 0;
      log.debug('connected');
    });

    ws.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'UtteranceEnd') {
        events.onFinal?.('', true); // signals end-of-turn with no new text
        return;
      }
      if (msg.type !== 'Results') return;
      const alt = msg.channel?.alternatives?.[0];
      const text: string = alt?.transcript ?? '';
      if (!text) return;
      if (msg.is_final) {
        // speech_final = Deepgram thinks the caller finished speaking
        events.onFinal?.(text, Boolean(msg.speech_final));
      } else {
        events.onPartial?.(text);
      }
    });

    ws.on('error', (e) => {
      log.error('ws error', e);
      events.onError?.(e);
    });
    ws.on('close', () => {
      open = false;
      events.onClose?.();
    });

    return {
      sendAudio(mulaw: Buffer) {
        if (open && ws.readyState === WebSocket.OPEN) ws.send(mulaw);
        else queue.push(mulaw);
      },
      close() {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
          ws.close();
        } catch {
          /* ignore */
        }
      },
    };
  }
}
