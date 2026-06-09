// OpenVoice Agent — dashboard SPA (vanilla JS)
const TOKEN_KEY = 'ova_token';
let token = localStorage.getItem(TOKEN_KEY) || '';

// Thrown when api() hits a 401 — caught by callers / surfaces to the auth gate.
class AuthError extends Error {}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api' + path, { ...opts, headers });
  if (res.status === 401) {
    signOut();
    throw new AuthError('Session expired — please sign in again.');
  }
  if (res.status === 204) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

const $ = (s) => document.querySelector(s);
const el = (id) => document.getElementById(id);

const TOOLS = ['check_availability', 'book_appointment', 'capture_lead', 'transfer_call', 'trigger_workflow', 'end_call'];
const FIELDS = ['name', 'business_name', 'greeting', 'persona', 'goals', 'knowledge_base', 'voice_id', 'language', 'transfer_number', 'webhook_url', 'after_hours', 'max_call_seconds'];

let agents = [];
let current = null;       // selected agent
let simSession = null;    // simulator session id
let voices = [];          // cached TTS voices from GET /api/voices

// ── Tabs ──
document.querySelectorAll('nav button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    el('tab-' + b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'calls') loadCalls();
    if (b.dataset.tab === 'crm') loadCrm();
    if (b.dataset.tab === 'analytics') loadAnalytics();
    if (b.dataset.tab === 'tenants') loadTenants();
  }),
);

// ── Health / role / billing ──
let health = null;
async function loadHealth() {
  try {
    health = await api('/health');
    el('health').textContent = `LLM:${health.providers.llm} · STT:${health.providers.stt} · TTS:${health.providers.tts} · Twilio:${health.twilio ? 'on' : 'off'}`;
    // Billing button: tenants only, and only when configured.
    el('billing-btn').classList.toggle('hidden', !(health.billing && health.role === 'tenant'));
    // Tenants tab: admin only.
    el('tenants-tab-btn').classList.toggle('hidden', health.role !== 'admin');
  } catch (e) {
    if (e instanceof AuthError) return;
    el('health').textContent = 'offline';
  }
}

// ── Identity (top bar) ──
function setIdentity() {
  const id = el('identity');
  if (health && health.role === 'admin') {
    id.textContent = 'Admin';
  } else if (currentTenant) {
    id.textContent = currentTenant.name || currentTenant.email || 'Tenant';
  } else {
    id.textContent = '';
  }
}

// ── Usage ──
async function loadUsage() {
  if (!health || health.role !== 'tenant') { el('usage').textContent = ''; return; }
  try {
    const u = await api('/usage');
    const limit = u.limit ? u.limit + ' min' : 'unlimited';
    el('usage').textContent = `${u.minutes || 0} / ${limit} this month`;
  } catch (e) { if (!(e instanceof AuthError)) el('usage').textContent = ''; }
}

// ── Voices (TTS picker) ──
async function loadVoices() {
  try {
    const v = await api('/voices');
    voices = Array.isArray(v) ? v : [];
  } catch (e) {
    if (e instanceof AuthError) return;
    voices = [];
  }
  populateVoiceSelect();
}

// (Re)build the <select id="f-voice_id"> options from the cached `voices`.
// Always keeps a leading "Provider default" option. Preserves current selection.
function populateVoiceSelect() {
  const sel = el('f-voice_id');
  if (!sel) return;
  const prev = sel.value;
  sel.textContent = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'Provider default';
  sel.appendChild(def);
  voices.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name + (v.description ? ' — ' + v.description : '');
    sel.appendChild(opt);
  });
  sel.value = prev;
}

// Ensure a value is selectable in the voice <select>, even if it's a custom id
// not present in the fetched voices list. Returns the select element.
function setVoiceSelection(voiceId) {
  const sel = el('f-voice_id');
  if (!sel) return null;
  const id = voiceId || '';
  if (id && !voices.some((v) => v.id === id)) {
    // Add a temporary option so a custom/unknown id still shows selected.
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id + ' (custom)';
    opt.dataset.custom = '1';
    sel.appendChild(opt);
  }
  sel.value = id;
  return sel;
}

(function bindVoicePreview() {
  const btn = el('voice-preview');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const sel = el('f-voice_id');
    const audio = el('voice-audio');
    const note = el('voice-preview-note');
    if (note) note.textContent = '';
    const v = voices.find((x) => x.id === (sel ? sel.value : ''));
    const url = v && v.preview_url;
    if (url && audio) {
      audio.src = url;
      audio.play().catch(() => { if (note) note.textContent = '(playback failed)'; });
    } else if (note) {
      note.textContent = '(no preview)';
      setTimeout(() => { if (note.textContent === '(no preview)') note.textContent = ''; }, 2500);
    }
  });
})();

// ── Agents ──
async function loadAgents() {
  agents = await api('/agents');
  const ul = el('agent-list');
  ul.innerHTML = '';
  agents.forEach((a) => {
    const li = document.createElement('li');
    li.innerHTML = `<div>${esc(a.name)}</div><div class="sub">${esc(a.business_name || '')}</div>`;
    li.onclick = () => selectAgent(a.id);
    if (current && current.id === a.id) li.classList.add('sel');
    ul.appendChild(li);
  });
  // build tool checkboxes once
  if (!el('tools').children.length) {
    TOOLS.forEach((t) => {
      const lbl = document.createElement('label');
      lbl.innerHTML = `<input type="checkbox" value="${t}" /> ${t}`;
      el('tools').appendChild(lbl);
    });
  }
}

async function selectAgent(id) {
  current = await api('/agents/' + id);
  simSession = null;
  el('sim-log').innerHTML = '';
  el('editor-empty').classList.add('hidden');
  el('agent-editor').classList.remove('hidden');
  el('editor-title').textContent = 'Edit: ' + current.name;
  FIELDS.forEach((f) => { if (el('f-' + f)) el('f-' + f).value = current[f] ?? ''; });
  // Voice select: rebuild known options, then select current (adding a temp
  // option if it's a custom id not in the fetched list).
  populateVoiceSelect();
  setVoiceSelection(current.voice_id || '');
  el('f-phone_number').value = current.phone_number ?? '';
  el('f-sms_confirmations').checked = current.sms_confirmations !== false;
  document.querySelectorAll('#tools input').forEach((cb) => { cb.checked = (current.enabled_tools || []).includes(cb.value); });
  loadAgents();
}

el('new-agent').onclick = async () => {
  const a = await api('/agents', { method: 'POST', body: JSON.stringify({ name: 'New Agent' }) });
  await loadAgents();
  selectAgent(a.id);
};

el('save-agent').onclick = async () => {
  const patch = {};
  FIELDS.forEach((f) => { if (el('f-' + f)) patch[f] = el('f-' + f).value; });
  patch.max_call_seconds = Number(patch.max_call_seconds) || 600;
  patch.phone_number = el('f-phone_number').value;
  patch.sms_confirmations = el('f-sms_confirmations').checked;
  patch.enabled_tools = [...document.querySelectorAll('#tools input:checked')].map((c) => c.value);
  el('save-status').textContent = 'Saving…';
  try {
    current = await api('/agents/' + current.id, { method: 'PUT', body: JSON.stringify(patch) });
    el('save-status').textContent = '✓ Saved';
    loadAgents();
  } catch (e) { el('save-status').textContent = '✗ ' + e.message; }
  setTimeout(() => (el('save-status').textContent = ''), 2500);
};

el('delete-agent').onclick = async () => {
  if (!confirm('Delete this agent?')) return;
  await api('/agents/' + current.id, { method: 'DELETE' });
  current = null;
  el('agent-editor').classList.add('hidden');
  el('editor-empty').classList.remove('hidden');
  loadAgents();
};

// ── Simulator ──
function simAppend(cls, text) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  el('sim-log').appendChild(d);
  el('sim-log').scrollTop = el('sim-log').scrollHeight;
}
async function simSend(message) {
  try {
    const r = await api('/simulate', { method: 'POST', body: JSON.stringify({ agentId: current.id, sessionId: simSession, message }) });
    simSession = r.sessionId;
    (r.replies || []).forEach((t) => simAppend('a', t));
    if (r.control) simAppend('t', '[call ' + (r.control.type === 'hangup' ? 'ended' : 'transferred to ' + r.control.number) + ']');
  } catch (e) { simAppend('t', 'error: ' + e.message); }
}
el('sim-send').onclick = () => {
  const v = el('sim-input').value.trim();
  if (!v) return;
  simAppend('u', v);
  el('sim-input').value = '';
  simSend(v);
};
el('sim-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('sim-send').click(); });
el('sim-reset').onclick = () => { simSession = null; el('sim-log').innerHTML = ''; simSend(null); };

// ── Outbound ──
el('outbound-call').onclick = async () => {
  const to = el('outbound-to').value.trim();
  if (!to) return;
  el('outbound-status').textContent = 'Calling…';
  try {
    const r = await api('/calls/outbound', { method: 'POST', body: JSON.stringify({ agentId: current.id, to }) });
    el('outbound-status').textContent = 'Ringing (' + (r.sid || r.callId) + ')';
  } catch (e) { el('outbound-status').textContent = '✗ ' + e.message; }
};

// ── Calls ──
async function loadCalls() {
  const calls = await api('/calls');
  const ul = el('call-list');
  ul.innerHTML = '';
  calls.forEach((c) => {
    const li = document.createElement('li');
    const out = c.outcome ? `<span class="badge ${c.outcome}">${c.outcome}</span>` : '';
    li.innerHTML = `<div>${esc(c.from_number || c.to_number || '—')} ${out}</div>
      <div class="sub">${c.direction} · ${c.status} · ${c.duration_sec || 0}s · ${fmt(c.started_at)}</div>`;
    li.onclick = () => loadTranscript(c.id, li);
    ul.appendChild(li);
  });
}
async function loadTranscript(id, li) {
  document.querySelectorAll('#call-list li').forEach((x) => x.classList.remove('sel'));
  li.classList.add('sel');
  const turns = await api('/calls/' + id + '/transcript');
  el('transcript').innerHTML = turns.length
    ? turns.map((t) => `<div class="turn"><div class="role">${t.role}</div>${esc(t.content)}</div>`).join('')
    : '<span class="muted">No transcript.</span>';
}

// ── CRM ──
async function loadCrm() {
  const leads = await api('/leads');
  el('leads-table').innerHTML =
    '<tr><th>Name</th><th>Phone</th><th>Email</th><th>Notes</th><th>When</th></tr>' +
    leads.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.phone)}</td><td>${esc(l.email)}</td><td>${esc(l.notes)}</td><td>${fmt(l.created_at)}</td></tr>`).join('');
  const appts = await api('/appointments');
  el('appts-table').innerHTML =
    '<tr><th>Contact</th><th>Phone</th><th>Start</th><th>Notes</th></tr>' +
    appts.map((a) => `<tr><td>${esc(a.contact_name)}</td><td>${esc(a.contact_phone)}</td><td>${fmt(a.start_at)}</td><td>${esc(a.notes)}</td></tr>`).join('');
}

// ── Analytics ──
function fmtMMSS(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

function statCard(label, value) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const v = document.createElement('div');
  v.className = 'stat-value';
  v.textContent = value;
  const l = document.createElement('div');
  l.className = 'stat-label';
  l.textContent = label;
  card.appendChild(v);
  card.appendChild(l);
  return card;
}

async function loadAnalytics() {
  const cards = el('analytics-cards');
  const chart = el('analytics-chart');
  const empty = el('analytics-empty');
  cards.textContent = '';
  chart.textContent = '';
  empty.classList.add('hidden');

  let data;
  try {
    data = await api('/analytics');
  } catch (e) {
    if (e instanceof AuthError) return;
    empty.textContent = 'Analytics unavailable.';
    empty.classList.remove('hidden');
    return;
  }

  const t = (data && data.totals) || {};
  const byDay = (data && Array.isArray(data.by_day)) ? data.by_day : [];

  if (!t.calls) {
    empty.textContent = 'No calls yet.';
    empty.classList.remove('hidden');
    return;
  }

  cards.appendChild(statCard('Calls', t.calls || 0));
  cards.appendChild(statCard('Booked', t.booked || 0));
  cards.appendChild(statCard('Booked rate', (t.booked_rate ?? 0) + '%'));
  cards.appendChild(statCard('Minutes used', t.minutes || 0));
  cards.appendChild(statCard('Leads captured', t.captured || 0));
  cards.appendChild(statCard('Transferred', t.transferred || 0));
  cards.appendChild(statCard('Avg call', fmtMMSS(t.avg_sec)));

  // ── 14-day bar chart (CSS-only) ──
  const days = byDay.slice(-14);
  const maxCalls = days.reduce((m, d) => Math.max(m, Number(d.calls) || 0), 0) || 1;
  days.forEach((d) => {
    const calls = Number(d.calls) || 0;
    const booked = Math.min(Number(d.booked) || 0, calls);
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.title = (d.day || '') + ' · ' + calls + ' calls, ' + booked + ' booked';

    const track = document.createElement('div');
    track.className = 'bar-track';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = Math.round((calls / maxCalls) * 100) + '%';
    if (calls > 0) {
      const sub = document.createElement('div');
      sub.className = 'bar-booked';
      sub.style.height = Math.round((booked / calls) * 100) + '%';
      bar.appendChild(sub);
    }
    track.appendChild(bar);

    const lbl = document.createElement('div');
    lbl.className = 'bar-label';
    lbl.textContent = dayLabel(d.day);

    col.appendChild(track);
    col.appendChild(lbl);
    chart.appendChild(col);
  });
}

// Extract day-of-month from a "YYYY-MM-DD" string for the bar label.
function dayLabel(day) {
  if (!day) return '';
  const m = /\d{4}-\d{2}-(\d{2})/.exec(day);
  return m ? String(Number(m[1])) : day;
}

// ── Tenants (admin only) ──
async function loadTenants() {
  if (!health || health.role !== 'admin') return;
  let tenants = [];
  try { tenants = await api('/tenants'); } catch (e) { if (e instanceof AuthError) return; throw e; }
  const ul = el('tenant-list');
  ul.innerHTML = '';
  tenants.forEach((t) => {
    const li = document.createElement('li');
    li.innerHTML = `<div>${esc(t.name)}</div>
      <div class="sub">${esc(t.email || '')} · ${esc(t.plan || '—')} · ${esc(t.status || '')}</div>`;
    ul.appendChild(li);
  });
  if (!tenants.length) ul.innerHTML = '<li class="muted">No tenants yet.</li>';
}

el('create-tenant').addEventListener('click', async () => {
  const name = el('new-tenant-name').value.trim();
  if (!name) return;
  el('tenant-status').textContent = 'Creating…';
  el('new-tenant-key').classList.add('hidden');
  try {
    const t = await api('/tenants', { method: 'POST', body: JSON.stringify({ name }) });
    el('tenant-status').textContent = '✓ Created';
    el('new-tenant-name').value = '';
    if (t.api_key) {
      el('new-tenant-key-val').textContent = t.api_key;
      el('new-tenant-key').classList.remove('hidden');
    }
    loadTenants();
  } catch (e) {
    if (e instanceof AuthError) return;
    el('tenant-status').textContent = '✗ ' + e.message;
  }
  setTimeout(() => (el('tenant-status').textContent = ''), 3000);
});

// ── Billing ──
el('billing-btn').addEventListener('click', async () => {
  el('billing-btn').textContent = 'Redirecting…';
  try {
    const r = await api('/billing/checkout', { method: 'POST', body: JSON.stringify({}) });
    if (r && r.url) window.location = r.url;
    else el('billing-btn').textContent = 'Upgrade / Billing';
  } catch (e) {
    if (e instanceof AuthError) return;
    alert('Billing unavailable: ' + e.message);
    el('billing-btn').textContent = 'Upgrade / Billing';
  }
});

// ── Calendar (Google Calendar connection) ──
async function loadCalendar() {
  const card = el('calendar-card');
  // Tenants only — hide entirely for admin.
  if (!health || health.role !== 'tenant') { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const body = el('calendar-body');
  body.textContent = '';
  body.appendChild(document.createTextNode(''));
  const loading = document.createElement('span');
  loading.className = 'muted';
  loading.textContent = 'Loading…';
  body.appendChild(loading);
  let status;
  try {
    status = await api('/calendar/status');
  } catch (e) {
    if (e instanceof AuthError) return;
    body.textContent = '';
    const err = document.createElement('span');
    err.className = 'muted';
    err.textContent = 'Calendar status unavailable.';
    body.appendChild(err);
    return;
  }
  renderCalendar(status);
}

function renderCalendar(status) {
  const body = el('calendar-body');
  body.textContent = '';

  if (!status.google_available) {
    const m = document.createElement('span');
    m.className = 'muted';
    m.textContent = 'Appointments use the built-in calendar. (Google Calendar not configured on this server.)';
    body.appendChild(m);
    return;
  }

  if (status.connected) {
    const s = document.createElement('span');
    s.className = 'cal-status connected';
    s.textContent = '✓ Google Calendar connected';
    body.appendChild(s);
    const reconnect = document.createElement('a');
    reconnect.className = 'cal-link';
    reconnect.textContent = 'Reconnect';
    reconnect.addEventListener('click', (e) => { e.preventDefault(); connectGoogleCalendar(reconnect); });
    body.appendChild(reconnect);
    return;
  }

  const s = document.createElement('span');
  s.className = 'cal-status';
  s.textContent = 'Calendar: built-in';
  body.appendChild(s);
  const btn = document.createElement('button');
  btn.className = 'primary cal-btn';
  btn.textContent = 'Connect Google Calendar';
  btn.addEventListener('click', () => connectGoogleCalendar(btn));
  body.appendChild(btn);
}

async function connectGoogleCalendar(trigger) {
  const original = trigger.textContent;
  trigger.textContent = 'Connecting…';
  if (trigger.tagName === 'BUTTON') trigger.disabled = true;
  try {
    const r = await api('/calendar/google/connect', { method: 'POST', body: JSON.stringify({}) });
    if (r && r.url) { window.location = r.url; return; }
    throw new Error('No authorization URL returned.');
  } catch (e) {
    if (e instanceof AuthError) return;
    alert('Could not start Google Calendar connection: ' + e.message);
    trigger.textContent = original;
    if (trigger.tagName === 'BUTTON') trigger.disabled = false;
  }
}

function showCalendarConnectedNote() {
  const note = el('calendar-note');
  note.textContent = '✓ Google Calendar connected successfully.';
  note.classList.remove('hidden');
  setTimeout(() => note.classList.add('hidden'), 6000);
}

// ── Auth gate ──
let currentTenant = null;     // signed-in tenant {id,name,email,...}
let authMode = 'login';       // 'login' | 'signup'

function showAuth() {
  el('dashboard').classList.add('hidden');
  el('auth-screen').classList.remove('hidden');
  authError('');
}

function showDashboard() {
  el('auth-screen').classList.add('hidden');
  el('dashboard').classList.remove('hidden');
  init();
}

function authError(msg) {
  const e = el('auth-error');
  e.textContent = msg || '';
  e.classList.toggle('hidden', !msg);
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  el('auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
  el('auth-sub').textContent = signup ? 'Start running AI voice agents.' : 'Sign in to your account.';
  el('auth-name-label').classList.toggle('hidden', !signup);
  el('auth-submit').textContent = signup ? 'Sign up' : 'Sign in';
  el('auth-toggle-text').textContent = signup ? 'Already have an account?' : 'No account yet?';
  el('auth-toggle').textContent = signup ? 'Sign in' : 'Sign up';
  el('auth-password').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  authError('');
}

el('auth-toggle').addEventListener('click', (e) => {
  e.preventDefault();
  setAuthMode(authMode === 'login' ? 'signup' : 'login');
});

async function submitAuth() {
  authError('');
  const email = el('auth-email').value.trim();
  const password = el('auth-password').value;
  if (!email || !password) { authError('Email and password are required.'); return; }
  if (authMode === 'signup' && password.length < 8) {
    authError('Password must be at least 8 characters.'); return;
  }
  const body = authMode === 'signup'
    ? { name: el('auth-name').value.trim(), email, password }
    : { email, password };
  el('auth-submit').disabled = true;
  el('auth-submit').textContent = '…';
  try {
    const res = await fetch('/api/auth/' + authMode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || (authMode === 'login' ? 'invalid credentials' : 'sign up failed'));
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    currentTenant = data.tenant || null;
    showDashboard();
  } catch (e) {
    authError(e.message);
  } finally {
    el('auth-submit').disabled = false;
    setAuthMode(authMode); // restores button label
  }
}

el('auth-submit').addEventListener('click', submitAuth);
['auth-name', 'auth-email', 'auth-password'].forEach((id) =>
  el(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); }));

// Admin token entry
async function submitAdminToken() {
  const t = el('auth-admin-token').value.trim();
  const errEl = el('auth-admin-error');
  errEl.classList.add('hidden');
  if (!t) { errEl.textContent = 'Paste a token.'; errEl.classList.remove('hidden'); return; }
  token = t;
  localStorage.setItem(TOKEN_KEY, token);
  currentTenant = null;
  // verify by hitting health before entering
  try {
    health = await api('/health');
    showDashboard();
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    token = '';
    errEl.textContent = 'Invalid token.';
    errEl.classList.remove('hidden');
  }
}
el('auth-admin-submit').addEventListener('click', submitAdminToken);
el('auth-admin-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdminToken(); });

// Sign out
function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  token = '';
  currentTenant = null;
  health = null;
  current = null;
  agents = [];
  showAuth();
}
el('signout-btn').addEventListener('click', signOut);

// ── Bootstrap ──
async function init() {
  await loadHealth();
  setIdentity();
  loadUsage();
  loadVoices();
  loadAgents();
  // Returning from Google OAuth: show a success note + clean the URL.
  let justConnected = false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar') === 'connected') {
      justConnected = true;
      params.delete('calendar');
      const qs = params.toString();
      const clean = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      history.replaceState(null, '', clean);
    }
  } catch (e) { /* URL API unavailable — ignore */ }
  await loadCalendar();
  if (justConnected) showCalendarConnectedNote();
}

if (token) {
  showDashboard();
} else {
  setAuthMode('login');
  showAuth();
}

// ── utils ──
function esc(s) { return (s ?? '').toString().replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function fmt(s) { return s ? new Date(s).toLocaleString() : ''; }
