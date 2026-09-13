(function () {
  'use strict';

  const VERSION = '0.19.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CONFIG_KEY = 'missionVectorRebelCorePairing_v1';
  const CARD_ID = 'vs-vector-bridge-v0190';
  const STYLE_ID = 'vs-vector-bridge-style-v0190';
  const COMPACT_KEY = 'missionVectorBridgeCompact_v0190';
  const ACTION_POLL_MS = 60000;
  const CSHIFT_ANCHOR = '2026-09-10';

  if (window.top !== window.self || window.__mvciVectorBridge0190) return;
  window.__mvciVectorBridge0190 = { version: VERSION, startedAt: Date.now() };

  const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const actionState = {
    packages: [],
    lastPollAt: null,
    lastError: null,
    polling: false,
  };

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function pairing() {
    const cfg = loadJson(CONFIG_KEY, null);
    if (!cfg?.endpoint || !cfg?.token || !/^https:\/\//i.test(cfg.endpoint)) return null;
    return cfg;
  }

  function actionEndpoint() {
    const cfg = pairing();
    if (!cfg) return null;
    try {
      const url = new URL(cfg.endpoint);
      if (/\/functions\/ingestTelemetry\/?$/i.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/functions\/ingestTelemetry\/?$/i, '/functions/getBridgeActions');
        return url.toString();
      }
    } catch (_) {}
    return null;
  }

  function state() {
    return loadJson(STATE_KEY, null);
  }

  function runtimeVersion() {
    return clean(window.__mvciLiveLoader?.runtimeVersion || state()?.metadata?.runtimeVersion || VERSION);
  }

  function displayedDate() {
    return window.MVCI_VECTOR_READER_0120?.displayedDate?.() || window.MVCI_VECTOR_READER_0120?.visibleDisplayedDate?.() || null;
  }

  function dayDiff(date) {
    if (!date) return null;
    const a = new Date(`${CSHIFT_ANCHOR}T12:00:00Z`);
    const b = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }

  function cShiftLabel(date) {
    const diff = dayDiff(date);
    if (diff == null) return 'Shift unknown';
    const mod = ((diff % 6) + 6) % 6;
    if (mod === 0) return 'C Shift Day 1';
    if (mod === 1) return 'C Shift Day 2';
    return 'Off C Shift';
  }

  function lastCaptureSummary() {
    const s = state();
    return s?.metadata?.lastCaptureSummary || null;
  }

  function compactEnabled() {
    return loadJson(COMPACT_KEY, true) !== false;
  }

  function setCompact(value) {
    saveJson(COMPACT_KEY, !!value);
    applyCompact();
    render();
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #mvci-vs-panel.mvci-bridge-compact .vs-card:not(#${CARD_ID}){display:none!important}
      #mvci-vs-panel.mvci-bridge-compact #vs-live-build-status-v0130,
      #mvci-vs-panel.mvci-bridge-compact #vs-backfill-card-v0130,
      #mvci-vs-panel.mvci-bridge-compact #vs-multirow-v0160,
      #mvci-vs-panel.mvci-bridge-compact #vs-segment-diagnostics-v0150,
      #mvci-vs-panel.mvci-bridge-compact #vs-rebel-core-sync-card-v0140,
      #mvci-vs-panel.mvci-bridge-compact #vs-rebel-core-segments-v0150{display:none!important}
      #${CARD_ID} .mvci-bridge-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      #${CARD_ID} .mvci-bridge-stat{border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px;background:rgba(0,0,0,.12)}
      #${CARD_ID} .mvci-bridge-label{font-size:10px;opacity:.62;text-transform:uppercase;letter-spacing:.06em}
      #${CARD_ID} .mvci-bridge-value{font-size:12px;font-weight:700;margin-top:2px}
      #${CARD_ID} .mvci-bridge-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
      #${CARD_ID} .mvci-bridge-input{margin-top:6px}
      #vector-staffing-collector-status{display:none!important}
    `;
    document.documentElement.appendChild(style);
  }

  function applyCompact() {
    ensureStyle();
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;
    panel.classList.toggle('mvci-bridge-compact', compactEnabled());
  }

  async function postTelemetry(event) {
    const cfg = pairing();
    if (!cfg) throw new Error('Rebel Core is not paired.');
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'content-type': 'application/json', 'x-rebel-device-key': cfg.token },
      body: JSON.stringify(event),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) throw new Error(clean(body?.error || body?.detail || `HTTP ${response.status}`));
    return body;
  }

  async function pollActions() {
    const cfg = pairing();
    const endpoint = actionEndpoint();
    if (!cfg || !endpoint || actionState.polling) return actionState;
    actionState.polling = true;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'content-type': 'application/json', 'x-rebel-device-key': cfg.token },
        body: JSON.stringify({ action_types: ['schedule', 'overtime_signup'] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) throw new Error(clean(body?.error || body?.detail || `HTTP ${response.status}`));
      actionState.packages = Array.isArray(body?.packages) ? body.packages : [];
      actionState.lastPollAt = nowIso();
      actionState.lastError = null;
    } catch (error) {
      actionState.lastError = clean(error?.message || error);
    } finally {
      actionState.polling = false;
      render();
    }
    return actionState;
  }

  async function scrapeNow() {
    const reader = window.MVCI_VECTOR_READER_0120;
    if (!reader?.captureNow) throw new Error('Vector reader is not loaded.');
    const out = reader.captureNow();
    try { await window.MVCI_REBEL_CORE_TELEMETRY_0140?.syncNow?.({ forceActivities: true }); } catch (_) {}
    try { await window.MVCI_REBEL_CORE_SEGMENTS_0150?.syncSegments?.(); } catch (_) {}
    render();
    return out;
  }

  async function syncNow() {
    const tasks = [];
    if (window.MVCI_REBEL_CORE_TELEMETRY_0140?.syncNow) tasks.push(window.MVCI_REBEL_CORE_TELEMETRY_0140.syncNow({ forceActivities: false }));
    if (window.MVCI_REBEL_CORE_SEGMENTS_0150?.syncSegments) tasks.push(window.MVCI_REBEL_CORE_SEGMENTS_0150.syncSegments());
    if (window.MVCI_REBEL_CORE_LEDGER_0150?.syncNow) tasks.push(window.MVCI_REBEL_CORE_LEDGER_0150.syncNow());
    if (window.MVCI_REBEL_CORE_OFFSHIFT_0180?.syncNow) tasks.push(window.MVCI_REBEL_CORE_OFFSHIFT_0180.syncNow());
    if (window.MVCI_REBEL_CORE_PROGRAM_HEARTBEAT_0170?.send) tasks.push(window.MVCI_REBEL_CORE_PROGRAM_HEARTBEAT_0170.send());
    if (!tasks.length) throw new Error('No Rebel Core sync modules are loaded.');
    await Promise.allSettled(tasks);
    await pollActions();
    render();
  }

  function packagesFor(type) {
    return actionState.packages.filter(p => p.action_type === type && ['approved','queued','previewed'].includes(p.status));
  }

  function previewText(pkg) {
    if (pkg?.action_type === 'schedule') {
      const assignments = Array.isArray(pkg?.payload?.assignments) ? pkg.payload.assignments : [];
      const lines = assignments.slice(0, 20).map(a => `${a.person_name || a.person_key || 'Unknown'} → ${a.unit || 'unit ?'} · ${a.position_label || a.planned_credit || 'position ?'}`);
      return `${pkg.summary}\n\n${lines.join('\n')}${assignments.length > 20 ? `\n…and ${assignments.length - 20} more` : ''}`;
    }
    const signups = Array.isArray(pkg?.payload?.signups) ? pkg.payload.signups : [];
    const lines = signups.slice(0, 20).map(s => `${s.person_name || s.person_key || 'Unknown'} → ${s.work_date || pkg.target_date || 'date ?'}`);
    return `${pkg.summary}\n\n${lines.join('\n')}${signups.length > 20 ? `\n…and ${signups.length - 20} more` : ''}`;
  }

  async function previewQueued(type) {
    const list = packagesFor(type);
    if (!list.length) return;
    const text = list.map((pkg, index) => `${index + 1}. ${previewText(pkg)}`).join('\n\n');
    alert(`VECTOR WRITE PREVIEW ONLY\n\n${text}\n\nNo Vector write is enabled in runtime ${VERSION}.`);
    for (const pkg of list) {
      if (pkg.status === 'previewed') continue;
      try {
        await postTelemetry({
          kind: 'vector_action_result',
          package_key: pkg.package_key,
          status: 'previewed',
          previewed_at: nowIso(),
          attempt_count: Number(pkg.attempt_count || 0),
          result: { mode: 'preview-only', runtime_version: runtimeVersion() },
          notes: 'Previewed in the Vector bridge. Write engine remains disabled.',
        });
      } catch (_) {}
    }
    await pollActions();
  }

  function cardHtml() {
    const cfg = pairing();
    const date = displayedDate();
    const capture = lastCaptureSummary();
    const scheduleCount = packagesFor('schedule').length;
    const overtimeCount = packagesFor('overtime_signup').length;
    const syncStatus = window.MVCI_REBEL_CORE_TELEMETRY_0140?.status?.() || {};
    const pairedText = cfg ? (actionState.lastError ? 'Connected · action poll warning' : 'Connected') : 'Not paired';
    const pollText = actionState.lastPollAt ? new Date(actionState.lastPollAt).toLocaleTimeString() : 'never';
    const compactText = compactEnabled() ? 'Advanced tools' : 'Compact view';
    return `
      <h3>Vector bridge <span class="vs-muted">${esc(VERSION)}</span></h3>
      <div class="mvci-bridge-grid">
        <div class="mvci-bridge-stat"><div class="mvci-bridge-label">Rebel Core</div><div class="mvci-bridge-value">${esc(pairedText)}</div></div>
        <div class="mvci-bridge-stat"><div class="mvci-bridge-label">Displayed</div><div class="mvci-bridge-value">${esc(date || 'Unknown')} · ${esc(cShiftLabel(date))}</div></div>
        <div class="mvci-bridge-stat"><div class="mvci-bridge-label">Last scrape</div><div class="mvci-bridge-value">${capture ? `${Number(capture.found || 0)}/${Number(capture.total || 0)} crew rows` : 'None yet'}</div></div>
        <div class="mvci-bridge-stat"><div class="mvci-bridge-label">Sync / queue</div><div class="mvci-bridge-value">${syncStatus.lastSuccessAt ? new Date(syncStatus.lastSuccessAt).toLocaleTimeString() : 'Not synced'} · ${Number(syncStatus.queued || 0)} pending</div></div>
      </div>
      <div class="mvci-bridge-actions">
        <button id="vs-bridge-scrape-v0190" class="vs-btn">SCRAPE NOW</button>
        <button id="vs-bridge-sync-v0190" class="vs-btn secondary" ${cfg ? '' : 'disabled'}>SYNC NOW</button>
      </div>
      <button id="vs-bridge-schedule-v0190" class="vs-btn mvci-bridge-input" ${scheduleCount ? '' : 'disabled'}>INPUT SCHEDULE · ${scheduleCount}</button>
      <button id="vs-bridge-ot-v0190" class="vs-btn secondary mvci-bridge-input" ${overtimeCount ? '' : 'disabled'}>INPUT OT SIGNUPS · ${overtimeCount}</button>
      <div class="vs-muted" style="margin-top:7px">0.19 development safety: INPUT buttons preview queued Rebel Core packages only. No Vector write is enabled yet.</div>
      <div class="vs-muted" style="margin-top:4px">Action poll: ${esc(pollText)}${actionState.lastError ? ` · ${esc(actionState.lastError)}` : ''}</div>
      <button id="vs-bridge-advanced-v0190" class="vs-btn secondary" style="margin-top:7px">${esc(compactText)}</button>
    `;
  }

  function wireCard(card) {
    const scrape = card.querySelector('#vs-bridge-scrape-v0190');
    if (scrape) scrape.onclick = async () => {
      scrape.disabled = true;
      try {
        const out = await scrapeNow();
        alert(`Vector scrape complete.\n\n${out?.date || displayedDate() || 'Date unknown'} · ${out?.results?.filter?.(r => r.found).length || 0}/${out?.results?.length || 0} tracked crew rows found.`);
      } catch (error) {
        alert(`Scrape failed safely.\n\n${error?.message || error}`);
      } finally { scrape.disabled = false; render(); }
    };
    const sync = card.querySelector('#vs-bridge-sync-v0190');
    if (sync) sync.onclick = async () => {
      sync.disabled = true;
      try { await syncNow(); alert('Rebel Core sync completed.'); }
      catch (error) { alert(`Sync failed without changing Vector.\n\n${error?.message || error}`); }
      finally { sync.disabled = false; render(); }
    };
    const schedule = card.querySelector('#vs-bridge-schedule-v0190');
    if (schedule) schedule.onclick = () => previewQueued('schedule');
    const ot = card.querySelector('#vs-bridge-ot-v0190');
    if (ot) ot.onclick = () => previewQueued('overtime_signup');
    const advanced = card.querySelector('#vs-bridge-advanced-v0190');
    if (advanced) advanced.onclick = () => setCompact(!compactEnabled());
  }

  function render() {
    applyCompact();
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;
    let card = panel.querySelector(`#${CARD_ID}`);
    if (!card) {
      card = document.createElement('div');
      card.id = CARD_ID;
      card.className = 'vs-card';
      const first = panel.querySelector('.vs-card');
      if (first) first.insertAdjacentElement('beforebegin', card);
      else panel.prepend(card);
    }
    const html = cardHtml();
    if (card.dataset.html !== html) {
      card.dataset.html = html;
      card.innerHTML = html;
      wireCard(card);
    }
  }

  function tick() {
    render();
    if (pairing() && (!actionState.lastPollAt || Date.now() - Date.parse(actionState.lastPollAt) > ACTION_POLL_MS)) pollActions().catch(() => {});
  }

  setInterval(tick, 1500);
  setTimeout(() => { render(); pollActions().catch(() => {}); }, 2500);

  window.MVCI_VECTOR_BRIDGE_0190 = {
    version: VERSION,
    scrapeNow,
    syncNow,
    pollActions,
    previewSchedule: () => previewQueued('schedule'),
    previewOvertime: () => previewQueued('overtime_signup'),
    setCompact,
  };
})();
