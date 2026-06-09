import { google } from 'googleapis';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { CalendarConnection, getCalendarConnection, upsertCalendarConnection } from '../db/index.js';
import { AgentConfig } from '../agent/types.js';

const log = logger('google-calendar');
const SLOT_MINUTES = 60;
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'];

export function oauthClient(redirectUri: string) {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, redirectUri);
}

export function googleRedirectUri(): string {
  return `${config.publicBaseUrl}/calendar/google/callback`;
}

/** Consent URL the tenant is sent to. `state` carries a signed tenant token. */
export function googleAuthUrl(state: string): string {
  return oauthClient(googleRedirectUri()).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

/** Exchange the OAuth code and persist tokens for a tenant. */
export async function googleExchangeAndStore(tenantId: string, code: string): Promise<void> {
  const client = oauthClient(googleRedirectUri());
  const { tokens } = await client.getToken(code);
  await upsertCalendarConnection({
    tenant_id: tenantId,
    provider: 'google',
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    calendar_id: 'primary',
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
  });
  log.info(`google calendar connected for tenant ${tenantId}`);
}

/** Build an authed client from stored tokens, persisting refreshed access tokens. */
async function authedClient(conn: CalendarConnection) {
  const client = oauthClient(googleRedirectUri());
  client.setCredentials({
    access_token: conn.access_token ?? undefined,
    refresh_token: conn.refresh_token ?? undefined,
    expiry_date: conn.expiry ? new Date(conn.expiry).getTime() : undefined,
  });
  client.on('tokens', (t) => {
    upsertCalendarConnection({
      ...conn,
      access_token: t.access_token ?? conn.access_token,
      refresh_token: t.refresh_token ?? conn.refresh_token,
      expiry: t.expiry_date ? new Date(t.expiry_date).toISOString() : conn.expiry,
    }).catch((e) => log.error('token persist failed', e));
  });
  return client;
}

/** Open 1-hour slots within business hours, checked against Google free/busy. */
export async function googleFindAvailability(agent: AgentConfig, fromIso: string, days = 5, limit = 6): Promise<string[]> {
  const conn = await getCalendarConnection(agent.tenant_id!);
  if (!conn) return [];
  const auth = await authedClient(conn);
  const cal = google.calendar({ version: 'v3', auth });

  const timeMin = new Date(fromIso);
  const timeMax = new Date(timeMin.getTime() + days * 86400000);
  const fb = await cal.freebusy.query({
    requestBody: { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: [{ id: conn.calendar_id }] },
  });
  const busy = (fb.data.calendars?.[conn.calendar_id]?.busy ?? []).map((b) => [new Date(b.start!).getTime(), new Date(b.end!).getTime()]);

  const out: string[] = [];
  for (let d = 0; d < days && out.length < limit; d++) {
    const day = new Date(timeMin);
    day.setDate(timeMin.getDate() + d);
    const hours = agent.business_hours[day.getDay()];
    if (!hours) continue;
    const [oh, om] = hours[0].split(':').map(Number);
    const [ch] = hours[1].split(':').map(Number);
    for (let h = oh; h < ch && out.length < limit; h++) {
      const slot = new Date(day);
      slot.setHours(h, om, 0, 0);
      const s = slot.getTime();
      const e = s + SLOT_MINUTES * 60000;
      if (s <= Date.now()) continue;
      if (!busy.some(([bs, be]) => s < be && e > bs)) out.push(slot.toISOString());
    }
  }
  return out;
}

export async function googleBook(
  agent: AgentConfig,
  startIso: string,
  contact: { name?: string; phone?: string; email?: string },
  notes?: string,
): Promise<{ ok: boolean; id?: string; end?: string; reason?: string }> {
  const conn = await getCalendarConnection(agent.tenant_id!);
  if (!conn) return { ok: false, reason: 'not_connected' };
  const auth = await authedClient(conn);
  const cal = google.calendar({ version: 'v3', auth });

  const start = new Date(startIso);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);

  // Re-check the slot is still free to avoid races.
  const fb = await cal.freebusy.query({
    requestBody: { timeMin: start.toISOString(), timeMax: end.toISOString(), items: [{ id: conn.calendar_id }] },
  });
  if ((fb.data.calendars?.[conn.calendar_id]?.busy ?? []).length) return { ok: false, reason: 'slot_taken' };

  const ev = await cal.events.insert({
    calendarId: conn.calendar_id,
    requestBody: {
      summary: `${agent.business_name}: ${contact.name ?? 'New appointment'}`,
      description: [notes, contact.phone && `Phone: ${contact.phone}`, contact.email && `Email: ${contact.email}`].filter(Boolean).join('\n'),
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: contact.email ? [{ email: contact.email }] : undefined,
    },
  });
  return { ok: true, id: ev.data.id ?? undefined, end: end.toISOString() };
}
