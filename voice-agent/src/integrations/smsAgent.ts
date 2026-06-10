import { Conversation } from '../pipeline/conversation.js';
import { makeLlm } from '../providers/index.js';
import { ToolContext } from '../agent/tools.js';
import { AgentConfig } from '../agent/types.js';
import { createCall, getSmsThread, upsertSmsThread, recentContactByPhone } from '../db/index.js';
import { isE164 } from '../server/twilioRest.js';

/**
 * Handle an inbound SMS with the SAME brain (LLM + tools) the phone agent uses, persisting
 * the conversation per (agent, contact) so it's stateful across messages. Returns the reply.
 */
export async function handleInboundSms(agent: AgentConfig, from: string, to: string, body: string): Promise<string> {
  const thread = await getSmsThread(agent.id, from);
  const callId =
    thread?.call_id ||
    (await createCall({ agent_id: agent.id, tenant_id: agent.tenant_id, direction: 'sms', from_number: from, to_number: to }));

  const ctx: ToolContext = { agent, callId, contact: {}, callerNumber: from };
  if (isE164(from)) {
    const prior: any = await recentContactByPhone(
      agent.tenant_id ? { tenantId: agent.tenant_id } : { agentId: agent.id },
      from,
    ).catch(() => null);
    if (prior?.name) {
      ctx.returningContact = { name: prior.name, lastNotes: prior.notes, lastSeen: new Date(prior.created_at).toLocaleDateString() };
      ctx.contact.name = prior.name;
      if (prior.email) ctx.contact.email = prior.email;
    }
  }

  const conv = new Conversation(makeLlm(), agent, ctx);
  if (thread?.history?.length) conv.messages.push(...thread.history); // restore prior turns

  const replies: string[] = [];
  for await (const ev of conv.respondTo(body)) {
    if (ev.type === 'say') replies.push(ev.text);
    // control actions (transfer/hangup) don't apply to SMS — ignore.
  }

  await upsertSmsThread(
    agent.id,
    agent.tenant_id,
    callId,
    from,
    conv.messages.filter((m) => m.role !== 'system'),
  );

  return replies.join(' ').trim() || 'Thanks for your message!';
}
