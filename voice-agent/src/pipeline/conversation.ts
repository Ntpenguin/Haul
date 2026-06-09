import { ChatMessage, LlmProvider } from '../providers/types.js';
import { AgentConfig } from '../agent/types.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import { ControlAction, runTool, ToolContext, toolSchemasFor } from '../agent/tools.js';
import { addTurn } from '../db/index.js';
import { logger } from '../logger.js';

const log = logger('conversation');

export type ConvEvent =
  | { type: 'say'; text: string }      // a sentence ready to be spoken
  | { type: 'control'; action: ControlAction };

/**
 * The agent "brain": runs the streaming LLM, executes tool calls in a loop, and
 * emits sentence-sized chunks of speech as soon as they're ready (for low latency).
 * Transport-agnostic — the phone session and the text simulator both drive this.
 */
export class Conversation {
  readonly messages: ChatMessage[];

  constructor(
    private llm: LlmProvider,
    private agent: AgentConfig,
    private ctx: ToolContext,
  ) {
    this.messages = [{ role: 'system', content: buildSystemPrompt(agent) }];
  }

  /** Seed the opening greeting without an LLM round-trip. */
  async greeting(): Promise<string> {
    this.messages.push({ role: 'assistant', content: this.agent.greeting });
    await addTurn(this.ctx.callId, 'assistant', this.agent.greeting);
    return this.agent.greeting;
  }

  /** Push a caller utterance and stream the agent's response. */
  async *respondTo(userText: string): AsyncGenerator<ConvEvent> {
    this.messages.push({ role: 'user', content: userText });
    await addTurn(this.ctx.callId, 'user', userText);
    yield* this.run();
  }

  private async *run(): AsyncGenerator<ConvEvent> {
    const tools = toolSchemasFor(this.agent);
    let hops = 0;

    while (hops++ < 5) {
      let buffer = '';      // unspoken text being accumulated into sentences
      let full = '';        // entire assistant text this hop
      const toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] = [];

      for await (const delta of this.llm.stream(this.messages, tools)) {
        if (delta.type === 'text') {
          buffer += delta.text;
          full += delta.text;
          let sentence: string | null;
          while ((sentence = takeSentence(buffer)) !== null) {
            buffer = buffer.slice(sentence.length);
            const clean = sentence.trim();
            if (clean) yield { type: 'say', text: clean };
          }
        } else if (delta.type === 'tool_call') {
          toolCalls.push(delta.call);
        }
      }
      const tail = buffer.trim();
      if (tail) yield { type: 'say', text: tail };

      if (full.trim()) await addTurn(this.ctx.callId, 'assistant', full.trim());

      if (toolCalls.length === 0) return; // plain answer — done

      // Record the assistant's tool-call turn, then execute each tool.
      this.messages.push({ role: 'assistant', content: full, tool_calls: toolCalls });

      let pendingControl: ControlAction | undefined;
      for (const call of toolCalls) {
        const res = await runTool(call.name, call.arguments, this.ctx);
        await addTurn(this.ctx.callId, 'tool', res.result, { name: call.name, args: call.arguments });
        this.messages.push({ role: 'tool', tool_call_id: call.id, content: res.result });
        if (res.control) pendingControl = res.control;
      }

      // Loop so the model can speak a natural response to the tool result.
      // The control action (transfer/hangup) is emitted AFTER that closing line.
      if (pendingControl) {
        yield* this.run();          // let model say its closing line
        yield { type: 'control', action: pendingControl };
        return;
      }
    }
    log.warn('hit max tool hops');
  }
}

/** Pull a complete sentence off the front of `buf`, or null if none yet. */
function takeSentence(buf: string): string | null {
  // Sentence end: . ! ? optionally followed by quote/paren, then space — or a newline.
  const m = buf.match(/^[\s\S]*?[.!?]["')\]]?(\s|$)/);
  if (m) return m[0];
  const nl = buf.indexOf('\n');
  if (nl >= 0) return buf.slice(0, nl + 1);
  // Flush very long run-ons even without punctuation to keep latency down.
  if (buf.length > 180) {
    const sp = buf.lastIndexOf(' ', 180);
    if (sp > 40) return buf.slice(0, sp + 1);
  }
  return null;
}
