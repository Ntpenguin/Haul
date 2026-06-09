import { appointmentsBetween, insertAppointment } from '../db/index.js';
import { AgentConfig } from '../agent/types.js';

/**
 * Minimal built-in calendar: 1-hour slots during business hours, no double-booking.
 * Swap this module for Google Calendar / Cal.com / GHL Calendar API in production —
 * the tool handlers only depend on these two functions.
 */

const SLOT_MINUTES = 60;

function parseHHMM(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number);
  return [h, m];
}

/** Return up to `limit` open slot start times (ISO) over the next `days` days. */
export function findAvailability(agent: AgentConfig, fromIso: string, days = 5, limit = 6): string[] {
  const out: string[] = [];
  const start = new Date(fromIso);
  for (let d = 0; d < days && out.length < limit; d++) {
    const day = new Date(start);
    day.setDate(start.getDate() + d);
    const dow = day.getDay();
    const hours = agent.business_hours[dow];
    if (!hours) continue;
    const [oh, om] = parseHHMM(hours[0]);
    const [ch] = parseHHMM(hours[1]);
    for (let h = oh; h < ch && out.length < limit; h++) {
      const slot = new Date(day);
      slot.setHours(h, om, 0, 0);
      if (slot.getTime() <= Date.now()) continue; // no slots in the past
      const slotEnd = new Date(slot.getTime() + SLOT_MINUTES * 60000);
      const conflicts = appointmentsBetween(agent.id, slot.toISOString(), slotEnd.toISOString());
      if (conflicts.length === 0) out.push(slot.toISOString());
    }
  }
  return out;
}

export function isSlotOpen(agent: AgentConfig, startIso: string): boolean {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
  return appointmentsBetween(agent.id, start.toISOString(), end.toISOString()).length === 0;
}

export function book(
  agent: AgentConfig,
  callId: string | undefined,
  startIso: string,
  contact: { name?: string; phone?: string; email?: string },
  notes?: string,
): { ok: boolean; id?: string; end?: string; reason?: string } {
  if (!isSlotOpen(agent, startIso)) return { ok: false, reason: 'slot_taken' };
  const start = new Date(startIso);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
  const id = insertAppointment({
    agent_id: agent.id,
    tenant_id: agent.tenant_id,
    call_id: callId,
    contact_name: contact.name,
    contact_phone: contact.phone,
    contact_email: contact.email,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    notes,
  });
  return { ok: true, id, end: end.toISOString() };
}
