import { Router } from 'express';
import express from 'express';
import { config } from '../config.js';
import {
  appointmentByToken,
  cancelAppointment,
  rescheduleAppointment,
  getAgent,
} from '../db/index.js';
import { findAvailability } from '../integrations/calendarProvider.js';
import { sendSms, isE164 } from './twilioRest.js';
import { logger } from '../logger.js';

const log = logger('manage');

/**
 * Public self-serve appointment management. Booking confirmations and reminders include
 * a /manage/<token> link where the contact can cancel or pick a new time — plain HTML
 * forms, no auth, no JS (the token IS the credential).
 */
export const manageRouter = Router();
manageRouter.use(express.urlencoded({ extended: false }));

export function manageUrl(token: string | undefined): string {
  return token && config.publicBaseUrl ? `${config.publicBaseUrl}/manage/${token}` : '';
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0c12;color:#e8eaf0;margin:0;display:flex;justify-content:center;padding:40px 16px}
.card{background:#11141d;border:1px solid #242a38;border-radius:16px;padding:28px;max-width:460px;width:100%}
h1{font-size:20px;margin:0 0 6px}p{color:#b7bdca;line-height:1.5}.muted{color:#828b9c;font-size:13px}
button{background:#6e8bff;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;margin:4px 6px 4px 0}
button.danger{background:transparent;border:1px solid #f87171;color:#f87171}
.slot{display:block;width:100%;text-align:left;background:#161a25;border:1px solid #242a38;color:#e8eaf0;margin:6px 0}
.ok{color:#34d399;font-weight:600}</style></head><body><div class="card">${body}</div></body></html>`;
}

async function load(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const appt: any = await appointmentByToken(token);
  if (!appt) return null;
  const agent = await getAgent(appt.agent_id);
  return agent ? { appt, agent } : null;
}

manageRouter.get('/:token', async (req, res) => {
  const found = await load(req.params.token);
  if (!found) return res.status(404).send(page('Not found', '<h1>Appointment not found</h1><p>This link is invalid or expired.</p>'));
  const { appt, agent } = found;
  if (appt.status === 'cancelled')
    return res.send(page('Cancelled', `<h1>${esc(agent.business_name)}</h1><p>This appointment has been cancelled. Call or text us to rebook.</p>`));

  const slots = await findAvailability(agent, new Date().toISOString(), 7, 8).catch(() => [] as string[]);
  const slotButtons = slots
    .filter((s) => s !== appt.start_at)
    .map((s) => `<form method="post" action="/manage/${esc(appt.manage_token)}/reschedule"><input type="hidden" name="start" value="${esc(s)}"><button class="slot">${esc(fmt(s))}</button></form>`)
    .join('');

  res.send(
    page(
      'Manage appointment',
      `<h1>${esc(agent.business_name)}</h1>
       <p>Your appointment${appt.contact_name ? `, ${esc(appt.contact_name)},` : ''} is scheduled for<br><strong>${esc(fmt(appt.start_at))}</strong>.</p>
       <h1 style="font-size:15px;margin-top:22px">Pick a new time</h1>
       ${slotButtons || '<p class="muted">No open slots in the next week — call us to reschedule.</p>'}
       <form method="post" action="/manage/${esc(appt.manage_token)}/cancel" style="margin-top:18px">
         <button class="danger">Cancel appointment</button>
       </form>
       <p class="muted">Need help? Just call or text the number that confirmed this booking.</p>`,
    ),
  );
});

manageRouter.post('/:token/cancel', async (req, res) => {
  const found = await load(req.params.token);
  if (!found) return res.status(404).send(page('Not found', '<h1>Appointment not found</h1>'));
  const { appt, agent } = found;
  if (appt.status !== 'cancelled') {
    await cancelAppointment(appt.id);
    if (isE164(agent.notify_number))
      sendSms(agent.notify_number, `Cancellation: ${appt.contact_name || 'a customer'} cancelled ${fmt(appt.start_at)}.`, agent.phone_number).catch(() => {});
    log.info(`appointment ${appt.id} cancelled via manage link`);
  }
  res.send(page('Cancelled', `<h1>${esc(agent.business_name)}</h1><p class="ok">Your appointment is cancelled.</p><p>We hope to see you another time!</p>`));
});

manageRouter.post('/:token/reschedule', async (req, res) => {
  const found = await load(req.params.token);
  if (!found) return res.status(404).send(page('Not found', '<h1>Appointment not found</h1>'));
  const { appt, agent } = found;
  const start = new Date(String(req.body?.start || ''));
  if (isNaN(start.getTime()) || start.getTime() < Date.now())
    return res.status(400).send(page('Invalid time', '<h1>Invalid time</h1><p>Go back and pick one of the offered slots.</p>'));
  // Re-validate against current availability (don't trust the posted value).
  const open = await findAvailability(agent, new Date().toISOString(), 7, 8).catch(() => [] as string[]);
  if (!open.includes(start.toISOString()))
    return res.status(409).send(page('Slot taken', '<h1>That time was just taken</h1><p>Go back and pick another slot.</p>'));
  const end = new Date(start.getTime() + (new Date(appt.end_at).getTime() - new Date(appt.start_at).getTime()));
  await rescheduleAppointment(appt.id, start.toISOString(), end.toISOString());
  if (isE164(agent.notify_number))
    sendSms(agent.notify_number, `Reschedule: ${appt.contact_name || 'a customer'} moved ${fmt(appt.start_at)} → ${fmt(start.toISOString())}.`, agent.phone_number).catch(() => {});
  log.info(`appointment ${appt.id} rescheduled via manage link`);
  res.send(page('Rescheduled', `<h1>${esc(agent.business_name)}</h1><p class="ok">You're rebooked for ${esc(fmt(start.toISOString()))}.</p>`));
});
