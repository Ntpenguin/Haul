import { dueReminders, markReminderSent, getAgent } from '../db/index.js';
import { sendSms } from '../server/twilioRest.js';
import { logger } from '../logger.js';

const log = logger('reminders');

/** Send any due appointment reminders (24h + 1h). Call on an interval. */
export async function processDueReminders(): Promise<void> {
  const due = await dueReminders();
  for (const r of due) {
    const agent = await getAgent(r.agent_id);
    // Mark as handled even if disabled/unsendable so we don't reprocess forever.
    if (!agent || agent.appointment_reminders === false) {
      await markReminderSent(r.id, r.kind);
      continue;
    }
    const when = new Date(r.start_at).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const body =
      `Reminder: your appointment with ${agent.business_name} is ` +
      `${r.kind === '1h' ? 'in about an hour' : 'tomorrow'} (${when}). Reply or call to reschedule.`;
    await sendSms(r.contact_phone!, body, agent.phone_number);
    await markReminderSent(r.id, r.kind);
    log.info(`sent ${r.kind} reminder for appointment ${r.id}`);
  }
}
