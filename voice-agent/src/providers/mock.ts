import {
  ChatMessage,
  LlmDelta,
  LlmProvider,
  SttEvents,
  SttProvider,
  SttStream,
  ToolSchema,
  TtsProvider,
  VoiceInfo,
} from './types.js';

/**
 * Zero-dependency mock providers so the entire stack runs with NO API keys —
 * useful for local demos, CI, and end-to-end verification. Select with
 * STT_PROVIDER=mock, LLM_PROVIDER=mock, TTS_PROVIDER=mock.
 *
 * The mock LLM is a small rule-based receptionist that actually exercises the tool
 * loop (availability → booking, lead capture, transfer, hangup), so the dashboard
 * text simulator and a real Media Streams call both demonstrate the full flow.
 */

export class MockStt implements SttProvider {
  async open(_events: SttEvents): Promise<SttStream> {
    return { sendAudio() {}, close() {} };
  }
}

export class MockTts implements TtsProvider {
  // One 20ms frame of μ-law silence (0xFF) per ~20 chars — enough to drive the
  // session's framing/marks without any audio backend.
  async *synthesize(text: string): AsyncGenerator<Buffer> {
    const frames = Math.max(1, Math.ceil(text.length / 20));
    for (let i = 0; i < frames; i++) yield Buffer.alloc(160, 0xff);
  }
  async listVoices(): Promise<VoiceInfo[]> {
    return [{ id: 'mock', name: 'Demo Voice', description: 'no-API mock' }];
  }
}

export class MockLlm implements LlmProvider {
  async *stream(messages: ChatMessage[], _tools: ToolSchema[]): AsyncGenerator<LlmDelta> {
    const last = messages[messages.length - 1];

    // ── Mid-tool-loop: the most recent message is a tool result → react to it ──
    if (last && last.role === 'tool') {
      const content = last.content;
      if (/ISO:/.test(content)) {
        const iso = content.match(/ISO:\s*([^,)]+)/)?.[1]?.trim();
        yield { type: 'tool_call', call: { id: id(), name: 'book_appointment', arguments: { start: iso } } };
        yield { type: 'done' };
        return;
      }
      if (/Booked/.test(content)) {
        yield { type: 'text', text: "Perfect, you're all set for that time. " };
        yield { type: 'text', text: 'Is there anything else I can help you with?' };
        yield { type: 'done' };
        return;
      }
      if (/No open slots/.test(content)) {
        yield { type: 'text', text: "Hmm, I'm not seeing any openings then. Want me to take your details and have someone call you back?" };
        yield { type: 'done' };
        return;
      }
      if (/Lead saved/.test(content)) {
        yield { type: 'text', text: "Got it — I've saved your details and someone will follow up shortly." };
        yield { type: 'done' };
        return;
      }
      // Terminal action (hangup/transfer): the closing line was already said.
      yield { type: 'done' };
      return;
    }

    // ── New caller turn: react to their intent ──
    const lastUser = (last?.content || '').toLowerCase();
    if (/\b(bye|goodbye|that'?s all|nothing else|no thanks|all set|we'?re good)\b/.test(lastUser)) {
      yield { type: 'text', text: 'Thanks for calling — have a great day! Goodbye.' };
      yield { type: 'tool_call', call: { id: id(), name: 'end_call', arguments: {} } };
      yield { type: 'done' };
      return;
    }
    if (/\b(human|person|agent|representative|someone|manager)\b/.test(lastUser)) {
      yield { type: 'text', text: 'No problem, let me connect you with someone now.' };
      yield { type: 'tool_call', call: { id: id(), name: 'transfer_call', arguments: {} } };
      yield { type: 'done' };
      return;
    }
    if (/\b(book|appointment|schedule|reserve|set up|come out|quote|estimate|move|moving)\b/.test(lastUser)) {
      yield { type: 'text', text: 'Happy to help you book that. Let me check what we have open. ' };
      yield { type: 'tool_call', call: { id: id(), name: 'check_availability', arguments: {} } };
      yield { type: 'done' };
      return;
    }
    if (/\b(price|cost|how much|rate|pricing|charge)\b/.test(lastUser)) {
      yield { type: 'text', text: 'Pricing depends on the job, but I can give you a quick estimate and get you on the calendar. ' };
      yield { type: 'text', text: 'Roughly how big is the job?' };
      yield { type: 'done' };
      return;
    }

    yield { type: 'text', text: "Thanks for calling! I can answer questions or book you an appointment. " };
    yield { type: 'text', text: 'How can I help?' };
    yield { type: 'done' };
  }
}

let n = 0;
const id = () => `mock_${++n}`;
