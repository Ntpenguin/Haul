import { AgentConfig, ToolName } from './types.js';
import { ToolSchema } from '../providers/types.js';
import { findAvailability, book } from '../integrations/calendarProvider.js';
import { postWebhook } from '../integrations/webhook.js';
import { sendSms, isE164 } from '../server/twilioRest.js';
import { insertLead, setOutcome } from '../db/index.js';
import { logger } from '../logger.js';

const log = logger('tools');

/** The SMS a caller receives after the agent books their appointment. */
export function confirmationSms(agent: AgentConfig, startIso: string): string {
  const when = new Date(startIso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `You're booked with ${agent.business_name} for ${when}. Reply here or call us with any questions.`;
}

export type ControlAction = { type: 'transfer'; number: string } | { type: 'hangup' };

export interface ToolContext {
  agent: AgentConfig;
  callId: string;
  /** Running record of what we've learned about the caller. */
  contact: { name?: string; phone?: string; email?: string };
  callerNumber?: string;
  /** Set when the caller's number matches a prior lead (returning-caller recognition). */
  returningContact?: { name?: string; lastNotes?: string; lastSeen?: string };
}

export interface ToolResult {
  /** String fed back to the LLM as the tool result. */
  result: string;
  /** Optional call-control side effect, applied after the agent's next spoken line. */
  control?: ControlAction;
}

// ── JSON-schema tool definitions (filtered by agent.enabled_tools) ──
const ALL_SCHEMAS: Record<ToolName, ToolSchema> = {
  check_availability: {
    name: 'check_availability',
    description: 'Get open appointment slots. Call before offering any times to the caller.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'ISO date/time to search from. Defaults to now.' },
        days: { type: 'number', description: 'How many days ahead to search (default 5).' },
      },
    },
  },
  book_appointment: {
    name: 'book_appointment',
    description: 'Book an appointment at a specific confirmed start time.',
    parameters: {
      type: 'object',
      required: ['start'],
      properties: {
        start: { type: 'string', description: 'ISO 8601 start time of a slot returned by check_availability.' },
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        notes: { type: 'string', description: 'Reason for the appointment / job details.' },
      },
    },
  },
  capture_lead: {
    name: 'capture_lead',
    description: 'Save the caller as a lead in the CRM once you have their name and phone or email.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        notes: { type: 'string', description: 'What they want / summary of the call.' },
      },
    },
  },
  transfer_call: {
    name: 'transfer_call',
    description: 'Transfer the caller to a human. Say a brief handoff line first.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' } },
    },
  },
  trigger_workflow: {
    name: 'trigger_workflow',
    description: 'Trigger an external automation/workflow via webhook with arbitrary data.',
    parameters: {
      type: 'object',
      properties: {
        event: { type: 'string' },
        data: { type: 'object' },
      },
    },
  },
  end_call: {
    name: 'end_call',
    description: 'End the call after saying goodbye.',
    parameters: { type: 'object', properties: { reason: { type: 'string' } } },
  },
};

export function toolSchemasFor(agent: AgentConfig): ToolSchema[] {
  return agent.enabled_tools.map((t) => ALL_SCHEMAS[t]).filter(Boolean);
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Execute a tool call and return the result string (+ optional control action). */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  log.info(`tool ${name}`, args);
  // Merge any contact fields the model passed into our running record.
  for (const k of ['name', 'phone', 'email'] as const) {
    if (typeof args[k] === 'string' && args[k]) ctx.contact[k] = args[k] as string;
  }

  try {
    switch (name) {
      case 'check_availability': {
        const from = (args.from as string) || new Date().toISOString();
        const days = (args.days as number) || 5;
        const slots = await findAvailability(ctx.agent, from, days);
        if (!slots.length) return { result: 'No open slots in that window.' };
        return { result: 'Open slots: ' + slots.map(fmtTime).join('; ') + '. (ISO: ' + slots.join(', ') + ')' };
      }

      case 'book_appointment': {
        const start = args.start as string;
        if (!start) return { result: 'Error: a start time is required.' };
        const res = await book(ctx.agent, ctx.callId, start, ctx.contact, args.notes as string);
        if (!res.ok) {
          if (res.reason === 'slot_taken') return { result: 'That slot was just taken. Offer another time.' };
          return { result: 'Could not book that time.' };
        }
        await setOutcome(ctx.callId, 'booked');
        await postWebhook(ctx.agent.webhook_url, {
          type: 'appointment_booked',
          agent_id: ctx.agent.id,
          appointment_id: res.id,
          start,
          contact: ctx.contact,
          notes: args.notes,
        });
        // Text the caller a confirmation (no-ops if disabled / no phone / Twilio off).
        let smsNote = '';
        if (ctx.agent.sms_confirmations) {
          const to = ctx.contact.phone || ctx.callerNumber;
          if (isE164(to)) {
            const sent = await sendSms(to!, confirmationSms(ctx.agent, start), ctx.agent.phone_number);
            smsNote = sent ? ' A confirmation text has been sent.' : '';
          }
        }
        // Notify the business owner/staff.
        if (isE164(ctx.agent.notify_number)) {
          await sendSms(
            ctx.agent.notify_number,
            `New booking for ${ctx.agent.business_name}: ${fmtTime(start)}${ctx.contact.name ? ` — ${ctx.contact.name}` : ''}.`,
            ctx.agent.phone_number,
          );
        }
        return { result: `Booked for ${fmtTime(start)}. Confirm this with the caller.${smsNote}` };
      }

      case 'capture_lead': {
        const id = await insertLead({
          agent_id: ctx.agent.id,
          tenant_id: ctx.agent.tenant_id,
          call_id: ctx.callId,
          name: ctx.contact.name,
          phone: ctx.contact.phone || ctx.callerNumber,
          email: ctx.contact.email,
          notes: args.notes as string,
        });
        await setOutcome(ctx.callId, 'captured');
        await postWebhook(ctx.agent.webhook_url, {
          type: 'lead_captured',
          agent_id: ctx.agent.id,
          lead_id: id,
          contact: { ...ctx.contact, phone: ctx.contact.phone || ctx.callerNumber },
          notes: args.notes,
        });
        if (isE164(ctx.agent.notify_number)) {
          await sendSms(
            ctx.agent.notify_number,
            `New lead for ${ctx.agent.business_name}: ${ctx.contact.name || 'caller'} ${ctx.contact.phone || ctx.callerNumber || ''}`.trim(),
            ctx.agent.phone_number,
          );
        }
        return { result: 'Lead saved.' };
      }

      case 'transfer_call': {
        const number = ctx.agent.transfer_number;
        if (!number) return { result: 'No transfer number configured. Offer to take a message instead.' };
        setOutcome(ctx.callId, 'transferred');
        return { result: 'Transferring now.', control: { type: 'transfer', number } };
      }

      case 'trigger_workflow': {
        const ok = await postWebhook(ctx.agent.webhook_url, {
          type: 'workflow',
          event: args.event,
          agent_id: ctx.agent.id,
          call_id: ctx.callId,
          data: args.data ?? {},
        });
        return { result: ok ? 'Workflow triggered.' : 'No webhook configured.' };
      }

      case 'end_call':
        return { result: 'Ending call.', control: { type: 'hangup' } };

      default:
        return { result: `Unknown tool ${name}.` };
    }
  } catch (e) {
    log.error(`tool ${name} failed`, e);
    return { result: 'That action failed. Apologize briefly and offer an alternative.' };
  }
}
