import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';
import { ChatMessage, LlmDelta, LlmProvider, ToolSchema } from '../types.js';

/** Anthropic Messages API with streaming + tool use. */
export class AnthropicLlm implements LlmProvider {
  private client = new Anthropic({ apiKey: config.anthropic.apiKey });

  async *stream(messages: ChatMessage[], tools: ToolSchema[]): AsyncGenerator<LlmDelta> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');

    const anthMessages: Anthropic.MessageParam[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        anthMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.tool_call_id!, content: m.content }],
        });
      } else if (m.role === 'assistant' && m.tool_calls?.length) {
        anthMessages.push({
          role: 'assistant',
          content: [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.tool_calls.map((c) => ({
              type: 'tool_use' as const,
              id: c.id,
              name: c.name,
              input: c.arguments,
            })),
          ],
        });
      } else {
        anthMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
      }
    }

    const anthTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));

    const stream = this.client.messages.stream({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: system || undefined,
      messages: anthMessages,
      tools: anthTools.length ? anthTools : undefined,
    });

    const toolBlocks: Record<number, { id: string; name: string; json: string }> = {};

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        toolBlocks[event.index] = { id: event.content_block.id, name: event.content_block.name, json: '' };
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          if (toolBlocks[event.index]) toolBlocks[event.index].json += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop' && toolBlocks[event.index]) {
        const b = toolBlocks[event.index];
        yield { type: 'tool_call', call: { id: b.id, name: b.name, arguments: safeJson(b.json) } };
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
