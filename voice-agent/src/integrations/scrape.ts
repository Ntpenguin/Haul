import { makeLlm } from '../providers/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const log = logger('scrape');
const MAX_CHARS = 12000; // cap raw text we feed the model
const SUBPAGE_KEYWORDS = /(about|service|pricing|price|faq|contact|hours|booking|appointment)/i;

/** Fetch a page and reduce it to readable plain text. */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'OpenVoiceAgent/1.0 (knowledge-base import)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/html') && !ctype.includes('text/plain')) return '';
  const html = await res.text();
  return htmlToText(html);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/** Same-origin subpage links that look informative (about/services/pricing/...). */
function relevantLinks(html: string, baseUrl: string, limit = 4): string[] {
  const origin = new URL(baseUrl).origin;
  const found = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (found.size >= limit) break;
    try {
      const u = new URL(m[1], baseUrl);
      if (u.origin === origin && SUBPAGE_KEYWORDS.test(u.pathname) && u.href !== baseUrl) found.add(u.href);
    } catch {
      /* skip bad href */
    }
  }
  return [...found];
}

/** Fetch the main page + a few relevant subpages and concatenate the text. */
export async function scrapeSite(url: string): Promise<string> {
  const target = /^https?:\/\//.test(url) ? url : `https://${url}`;
  const res = await fetch(target, {
    headers: { 'User-Agent': 'OpenVoiceAgent/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Could not fetch ${target} (HTTP ${res.status})`);
  const html = await res.text();

  let text = htmlToText(html);
  for (const link of relevantLinks(html, target)) {
    try {
      const t = await fetchText(link);
      if (t) text += `\n\n--- ${link} ---\n${t}`;
    } catch {
      /* ignore subpage failures */
    }
    if (text.length > MAX_CHARS) break;
  }
  return text.slice(0, MAX_CHARS);
}

/** Condense scraped text into a clean knowledge base via the LLM (falls back to raw text). */
export async function buildKnowledgeBase(siteText: string): Promise<string> {
  const trimmed = siteText.trim();
  if (!trimmed) return '';
  const hasLlm =
    (config.providers.llm === 'openai' && config.openai.apiKey) ||
    (config.providers.llm === 'anthropic' && config.anthropic.apiKey);
  if (!hasLlm) return trimmed.slice(0, 4000);

  const llm = makeLlm();
  const system =
    'You build a concise knowledge base for an AI phone receptionist. From the website text, ' +
    'extract only facts the receptionist needs to answer callers and book jobs: services offered, ' +
    'pricing, business hours, service area/location, booking or estimate policy, and common FAQs. ' +
    'Output plain text grouped under simple labels (Services:, Pricing:, Hours:, Area:, FAQ:). ' +
    'Be factual and concise; ignore navigation, marketing fluff, and boilerplate. No markdown headers.';
  let out = '';
  try {
    for await (const d of llm.stream(
      [
        { role: 'system', content: system },
        { role: 'user', content: `Website text:\n\n${trimmed}` },
      ],
      [],
    )) {
      if (d.type === 'text') out += d.text;
    }
  } catch (e) {
    log.error('kb summarize failed', e);
    return trimmed.slice(0, 4000);
  }
  return out.trim() || trimmed.slice(0, 4000);
}
