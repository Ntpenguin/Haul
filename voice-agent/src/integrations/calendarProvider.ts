import { AgentConfig } from '../agent/types.js';
import { getCalendarConnection, insertAppointment } from '../db/index.js';
import { config } from '../config.js';
import * as builtin from './calendar.js';
import { googleFindAvailability, googleBook } from './googleCalendar.js';

export interface BookResult {
  ok: boolean;
  id?: string;
  end?: string;
  reason?: string;
}

/**
 * Resolves the calendar backend for an agent: Google Calendar if the tenant has connected
 * it, otherwise the built-in Postgres calendar. The booking action is identical to callers.
 */
async function usesGoogle(agent: AgentConfig): Promise<boolean> {
  if (!config.google.enabled || !agent.tenant_id) return false;
  const conn = await getCalendarConnection(agent.tenant_id);
  return Boolean(conn && conn.provider === 'google' && conn.refresh_token);
}

export async function findAvailability(agent: AgentConfig, fromIso: string, days = 5, limit = 6): Promise<string[]> {
  if (await usesGoogle(agent)) return googleFindAvailability(agent, fromIso, days, limit);
  return builtin.findAvailability(agent, fromIso, days, limit);
}

export async function book(
  agent: AgentConfig,
  callId: string | undefined,
  startIso: string,
  contact: { name?: string; phone?: string; email?: string },
  notes?: string,
): Promise<BookResult> {
  if (await usesGoogle(agent)) {
    const res = await googleBook(agent, startIso, contact, notes);
    if (!res.ok) return res;
    // Mirror into our DB so it shows in the dashboard CRM + usage.
    await insertAppointment({
      agent_id: agent.id,
      tenant_id: agent.tenant_id,
      call_id: callId,
      contact_name: contact.name,
      contact_phone: contact.phone,
      contact_email: contact.email,
      start_at: startIso,
      end_at: res.end!,
      notes,
      external_id: res.id,
    });
    return res;
  }
  return builtin.book(agent, callId, startIso, contact, notes);
}
