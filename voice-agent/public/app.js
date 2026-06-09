// OpenVoice Agent — dashboard SPA (vanilla JS)
const TOKEN_KEY = 'ova_token';
let token = localStorage.getItem(TOKEN_KEY) || '';

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api' + path, { ...opts, headers });
  if (res.status === 401) {
    token = prompt('Admin token:') || '';
    localStorage.setItem(TOKEN_KEY, token);
    return api(path, opts);
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

// ── Tabs ──
document.querySelectorAll('nav button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    el('tab-' + b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'calls') loadCalls();
    if (b.dataset.tab === 'crm') loadCrm();
  }),
);

// ── Health ──
async function loadHealth() {
  try {
    const h = await api('/health');
    el('health').textContent = `LLM:${h.providers.llm} · STT:${h.providers.stt} · TTS:${h.providers.tts} · Twilio:${h.twilio ? 'on' : 'off'}`;
  } catch (e) { el('health').textContent = 'offline'; }
}

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
  el('f-phone_number').value = current.phone_number ?? '';
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

// ── utils ──
function esc(s) { return (s ?? '').toString().replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function fmt(s) { return s ? new Date(s).toLocaleString() : ''; }

loadHealth();
loadAgents();
