import OpenAI from 'openai';
import { config } from '../../config.js';
import { ChatMessage, LlmDelta, LlmProvider, ToolSchema } from '../types.js';

/** OpenAI Chat Completions with streaming + tool calls. */
export class OpenAiLlm implements LlmProvider {
  private client = new OpenAI({ apiKey: config.openai.apiKey });

  async *stream(messages: ChatMessage[], tools: ToolSchema[]): AsyncGenerator<LlmDelta> {
    const oaTools = tools.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const oaMessages = messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool' as const, content: m.content, tool_call_id: m.tool_call_id! };
      }
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: m.content || null,
          tool_calls: m.tool_calls.map((c) => ({
            id: c.id,
            type: 'function' as const,
            function: { name: c.name, arguments: JSON.stringify(c.arguments) },
          })),
        };
      }
      return { role: m.role as 'system' | 'user' | 'assistant', content: m.content };
    });

    const stream = await this.client.chat.completions.create({
      model: config.openai.model,
      messages: oaMessages as any,
      tools: oaTools.length ? oaTools : undefined,
      stream: true,
      temperature: 0.5,
    });

    // Accumulate tool call fragments by index.
    const partial: Record<number, { id: string; name: string; args: string }> = {};

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = choice?.delta;
      if (delta?.content) yield { type: 'text', text: delta.content };
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          partial[idx] ??= { id: '', name: '', args: '' };
          if (tc.id) partial[idx].id = tc.id;
          if (tc.function?.name) partial[idx].name += tc.function.name;
          if (tc.function?.arguments) partial[idx].args += tc.function.arguments;
        }
      }
      if (choice?.finish_reason === 'tool_calls') {
        for (const p of Object.values(partial)) {
          yield {
            type: 'tool_call',
            call: { id: p.id, name: p.name, arguments: safeJson(p.args) },
          };
        }
      }
    }
    yield { type: 'done' };
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}
