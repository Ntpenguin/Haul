import { config } from '../config.js';
import { LlmProvider, SttProvider, TtsProvider } from './types.js';
import { DeepgramStt } from './stt/deepgram.js';
import { OpenAiLlm } from './llm/openai.js';
import { AnthropicLlm } from './llm/anthropic.js';
import { ElevenLabsTts } from './tts/elevenlabs.js';
import { DeepgramTts } from './tts/deepgram.js';
import { MockStt, MockLlm, MockTts } from './mock.js';

export function makeStt(): SttProvider {
  switch (config.providers.stt) {
    case 'mock':
      return new MockStt();
    case 'deepgram':
    default:
      return new DeepgramStt();
  }
}

export function makeLlm(): LlmProvider {
  switch (config.providers.llm) {
    case 'mock':
      return new MockLlm();
    case 'anthropic':
      return new AnthropicLlm();
    case 'openai':
    default:
      return new OpenAiLlm();
  }
}

export function makeTts(): TtsProvider {
  switch (config.providers.tts) {
    case 'mock':
      return new MockTts();
    case 'deepgram':
      return new DeepgramTts();
    case 'elevenlabs':
    default:
      return new ElevenLabsTts();
  }
}
