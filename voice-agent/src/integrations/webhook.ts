import { logger } from '../logger.js';

const log = logger('webhook');

/**
 * Fire-and-forget outbound webhook. This is the integration seam to your CRM /
 * automation platform (GoHighLevel inbound webhook, n8n, Zapier, Make, etc.).
 */
export async function postWebhook(url: string, payload: unknown): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) log.warn(`webhook ${url} -> HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    log.error('webhook failed', e);
    return false;
  }
}
