/**
 * Self-test for the agent brain — no API keys or telephony required.
 * Injects a stubbed LLM into the Conversation engine and drives a full
 * "book an appointment" flow, asserting the tool loop + calendar work.
 *
 *   npm run selftest
 */
import assert from 'node:assert';
import { Conversation } from '../src/pipeline/conversation.js';
import { createAgent, createCall, listAppointments } from '../src/db/index.js';
import { ToolContext } from '../src/agent/tools.js';
import { LlmDelta, LlmProvider, ChatMessage, ToolSchema } from '../src/providers/types.js';

// A scripted LLM: behaves like a model that checks availability, books the first
// slot it's offered, then confirms — exercising the multi-hop tool loop.
class StubLlm implements LlmProvider {
  async *stream(messages: ChatMessage[], _tools: ToolSchema[]): AsyncGenerator<LlmDelta> {
    const lastTool = [...messages].reverse().find((m) => m.role === 'tool');
    const userSaidBook = messages.some((m) => m.role === 'user' && /book|appointment|move/i.test(m.content));

    if (lastTool && /ISO:/.test(lastTool.content)) {
      // We have availability → book the first ISO slot.
      const iso = lastTool.content.match(/ISO:\s*([^,)]+)/)?.[1]?.trim();
      yield { type: 'tool_call', call: { id: 'c2', name: 'book_appointment', arguments: { start: iso, name: 'Jane Doe', phone: '+15125559999' } } };
      yield { type: 'done' };
      return;
    }
    if (lastTool && /Booked/.test(lastTool.content)) {
      yield { type: 'text', text: 'Great, you are all set. ' };
      yield { type: 'text', text: 'Anything else I can help with?' };
      yield { type: 'done' };
      return;
    }
    if (userSaidBook) {
      yield { type: 'tool_call', call: { id: 'c1', name: 'check_availability', arguments: {} } };
      yield { type: 'done' };
      return;
    }
    yield { type: 'text', text: 'How can I help?' };
    yield { type: 'done' };
  }
}

const agent = createAgent({ name: 'Selftest', business_name: 'Test Co' } as any);
const callId = createCall({ agent_id: agent.id, direction: 'inbound', from_number: 'selftest' });
const ctx: ToolContext = { agent, callId, contact: {}, callerNumber: '+15125559999' };
const conv = new Conversation(new StubLlm(), agent, ctx);

const before = listAppointments(agent.id).length;
const replies: string[] = [];
for await (const ev of conv.respondTo('I want to book a move for my apartment')) {
  if (ev.type === 'say') replies.push(ev.text);
}
const after = listAppointments(agent.id).length;

console.log('Agent replies:', replies);
assert(replies.some((r) => /all set|set/i.test(r)), 'expected a confirmation reply');
assert(after === before + 1, 'expected exactly one appointment to be booked');
// Sentence chunking should split the confirmation into 2 spoken chunks.
assert(replies.length >= 2, 'expected sentence-level chunking');

console.log(`\n✓ Self-test passed — booked ${after - before} appointment via the tool loop.`);
process.exit(0);
