/** Provider-agnostic interfaces. Swap implementations via env without touching the pipeline. */

// ── Speech-to-text (streaming) ──
export interface SttEvents {
  /** Interim hypothesis (may change). */
  onPartial?: (text: string) => void;
  /** Stable transcript for a chunk of speech. `endOfTurn` true when the caller paused. */
  onFinal?: (text: string, endOfTurn: boolean) => void;
  onError?: (err: unknown) => void;
  onClose?: () => void;
}

export interface SttStream {
  /** Feed raw 8kHz μ-law audio (the format Twilio Media Streams delivers). */
  sendAudio(mulaw: Buffer): void;
  /** Flush + close the recognizer. */
  close(): void;
}

export interface SttProvider {
  open(events: SttEvents): Promise<SttStream>;
}

// ── LLM (streaming, tool-calling) ──
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** For tool results: the id of the tool call being answered. */
  tool_call_id?: string;
  /** For assistant turns that requested tools. */
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export type LlmDelta =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done' };

export interface LlmProvider {
  /** Stream a completion. Yields text deltas and any tool calls the model requests. */
  stream(messages: ChatMessage[], tools: ToolSchema[]): AsyncGenerator<LlmDelta>;
}

// ── Text-to-speech (streaming) ──
export interface TtsProvider {
  /** Synthesize `text`; yields 8kHz μ-law audio chunks ready for Twilio. */
  synthesize(text: string, voiceId?: string): AsyncGenerator<Buffer>;
}
