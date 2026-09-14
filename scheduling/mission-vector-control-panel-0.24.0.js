(function () {
  'use strict';

  const VERSION = '0.24.0-dev';
  const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const PAIR_KEY = 'vectorStaffingCollectorPairing_v1';
  const ROOT_ID = 'mvci-control-panel-v0240';
  const STYLE_ID = 'mvci-control-panel-style-v0240';
  const PENDING_KEY = 'mvciControlPending_v0240';
  const STATUS_KEY = 'mvciControlStatus_v0240';
  const RANKING_PATH_KEY = 'mvciLastRankingPath_v1';
  const DEFAULT_RANKING_PATH = '/Application/ControlPanel/CallbackModule/Rankings/63542/95668';

  if (window.top !== window.self || window.__mvciControlPanel0240) return;
  window.__mvciControlPanel0240 = { version: VERSION, startedAt: Date.now() };

  const state = {
    open: false,
    settingsOpen: false,
    busy: false,
    worklist: [],
    lastMessage: '',
    lastKind: 'info',
  };

  const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function loadJson(key, fallback = {}) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function removeKey(key) { try { localStorage.removeItem(key); } catch (_) {} }

  function pairing() {
    const p = loadJson(PAIR_KEY, {});
    return {
      deviceId: clean(p.deviceId),
      token: clean(p.token),
      endpoint: clean(p.endpoint) || ENDPOINT,
    };
  }
  function paired() { const p = pairing(); return !!(p.deviceId && p.token); }

  function parseDate(value) {
    const text = decodeURIComponent(clean(value).replace(/^#/, ''));
    let m = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;
    m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
    if (m) return `${m[3]}-${String(Number(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;
    return '';
  }

  function localToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function visibleDate() {
    for (const value of [location.hash, location.pathname, location.search]) {
      const parsed = parseDate(value);
      if (parsed) return parsed;
    }
    const reader = window.MVCI_VECTOR_READER_0120;
    const readerDate = clean(reader?.visibleDisplayedDate?.() || reader?.displayedDate?.());
    if (/^\d{4}-\d{2}-\d{2}$/.test(readerDate)) return readerDate;
    const inputs = [...document.querySelectorAll('input')]
      .map(el => parseDate(el.value))
      .filter(Boolean);
    const unique = [...new Set(inputs)];
    return unique.length === 1 ? unique[0] : '';
  }

  function isListView() { return /\/Application\/ControlPanel\/ListView/i.test(location.pathname); }
  function isRankingPage() { return /\/Application\/ControlPanel\/CallbackModule\/Rankings/i.test(location.pathname); }

  if (isRankingPage()) saveJson(RANKING_PATH_KEY, { path: location.pathname, at: Date.now() });

  function dateParts(date) {
    const [y,m,d] = String(date).split('-');
    return { hash: `${y}/${m}/${d}`, us: `${m}/${d}/${y}` };
  }

  function listViewUrl(date) {
    const p = dateParts(date);
    return `${location.origin}/Application/ControlPanel/ListView/#${p.hash}`;
  }

  function rankingUrl(date) {
    const p = dateParts(date);
    const saved = loadJson(RANKING_PATH_KEY, {});
    const path = /^\/Application\/ControlPanel\/CallbackModule\/Rankings\//i.test(clean(saved.path))
      ? clean(saved.path)
      : DEFAULT_RANKING_PATH;
    return `${location.origin}${path}?shift_date=${encodeURIComponent(p.us)}&select-date=`;
  }

  async function request(path = '', options = {}) {
    const p = pairing();
    if (!p.deviceId || !p.token) throw new Error('Rebel Command pairing is not configured.');
    const response = await fetch(`${p.endpoint || ENDPOINT}${path}`, {
      method: options.method || 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${p.token}`,
        'X-Rebel-Device-ID': p.deviceId,
        ...(options.body ? {'Content-Type':'application/json'} : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) throw new Error(clean(body?.error || `Rebel Command request failed (${response.status})`));
    return body;
  }

  function setMessage(message, kind = 'info') {
    state.lastMessage = clean(message);
    state.lastKind = kind;
    saveJson(STATUS_KEY, { message: state.lastMessage, kind, at: Date.now() });
    if (!state.busy) render();
  }

  function loadLastMessage() {
    const saved = loadJson(STATUS_KEY, {});
    if (saved?.message) {
      state.lastMessage = clean(saved.message);
      state.lastKind = clean(saved.kind) || 'info';
    }
  }

  async function refreshWorklist({ renderAfter = true } = {}) {
    if (!paired()) { state.worklist = []; if (renderAfter && !state.busy) render(); return []; }
    try {
      const body = await request('?action=action-worklist');
      state.worklist = Array.isArray(body?.packages) ? body.packages : [];
    } catch (error) {
      state.worklist = [];
      state.lastMessage = `Connection check failed: ${clean(error?.message || error)}`;
      state.lastKind = 'error';
    }
    if (renderAfter && !state.busy) render();
    return state.worklist;
  }

  function savePending(value) { saveJson(PENDING_KEY, { ...value, requestedAt: Date.now(), version: VERSION }); }

  async function waitFor(fn, timeout = 25000, interval = 250) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { const value = fn(); if (value) return value; } catch (_) {}
      await wait(interval);
    }
    return null;
  }

  async function collectStaffing(date) {
    const bridge = await waitFor(() => window.MVCI_VECTOR_BRIDGE_0200?.scrapeNow ? window.MVCI_VECTOR_BRIDGE_0200 : null, 20000);
    if (!bridge) throw new Error('Vector staffing bridge did not load.');
    if (visibleDate() !== date) throw new Error(`ListView opened on ${visibleDate() || 'an unknown date'} instead of ${date}.`);
    await bridge.scrapeNow();
    const status = bridge.status?.() || {};
    if (status.status === 'sent-good') {
      const cap = status.lastCapture || {};
      return `Staffing complete for ${date}: ${cap.rows ?? '—'} rows, ${cap.regular ?? '—'} regular 24-hour, ${cap.groups ?? '—'} groups.`;
    }
    if (status.status === 'sent-partial') throw new Error(`Staffing was sent for ${date}, but it did not pass the full-census safety gate.`);
    if (status.status === 'error') throw new Error(status.lastError || 'Staffing collection failed.');
    throw new Error(`Staffing collection ended with status ${status.status || 'unknown'}.`);
  }

  async function collectOvertime(date) {
    if (visibleDate() !== date) throw new Error(`OT Rankings opened on ${visibleDate() || 'an unknown date'} instead of ${date}.`);
    const api = await waitFor(() => {
      if (window.MVCI_OVERTIME_COLLECTOR?.captureRanking) return window.MVCI_OVERTIME_COLLECTOR;
      if (window.__vectorOvertimeCollector?.capture) return { captureRanking: () => window.__vectorOvertimeCollector.capture() };
      const button = document.getElementById('vector-overtime-collector-status');
      if (button) return { captureRanking: async () => { button.click(); await wait(2500); return {}; } };
      return null;
    }, 20000);
    if (!api) throw new Error('OT Priority collector did not load.');
    const result = await api.captureRanking({ force: true });
    if (result?.ranking?.quality === 'good') return `OT priority complete for ${date}: ${result.ranking.rows ?? result.ranking.row_count ?? 'ranking'} rows accepted.`;
    if (result?.ranking?.quality === 'partial') throw new Error(`OT priority was sent for ${date}, but Rebel Command marked it for review.`);
    if (result?.ok === false) throw new Error(result.error || 'OT priority collection failed.');
    return `OT priority collection finished for ${date}. Refresh Rebel Command to review the result.`;
  }

  async function freshGoodCensus() {
    const bridge = await waitFor(() => window.MVCI_VECTOR_BRIDGE_0200?.scrapeNow ? window.MVCI_VECTOR_BRIDGE_0200 : null, 20000);
    if (!bridge) throw new Error('Vector staffing bridge did not load.');
    await bridge.scrapeNow();
    const status = bridge.status?.() || {};
    if (status.status === 'error') throw new Error(status.lastError || 'Fresh Vector census failed.');
    if (status.status !== 'sent-good') throw new Error(`Fresh census did not pass the safety gate (${status.status || 'unknown'}).`);
    return status;
  }

  async function preflight(packageKey) {
    const body = await request(`?action=action-preflight&packageKey=${encodeURIComponent(packageKey)}`);
    return body?.preflight || {};
  }

  async function previewAction(pkg) {
    const date = visibleDate();
    if (date !== pkg.targetDate) throw new Error(`Open ListView for ${pkg.targetDate}; displayed date is ${date || 'unknown'}.`);
    const census = await freshGoodCensus();
    const pf = await preflight(pkg.packageKey);
    const result = await request('', {
      method: 'POST',
      body: {
        version: VERSION,
        actionPreview: {
          packageKey: pkg.packageKey,
          displayedDate: date,
          sourceVersion: VERSION,
          preconditionMatch: pf?.ready === true,
          evidence: {
            freshCensusStatus: census.status,
            lastCapture: census.lastCapture || null,
            serverPreflight: pf,
            automatedWriteAttempted: false,
          },
        },
      },
    });
    const preview = result?.actionPreview;
    if (!preview?.ready) throw new Error(`Input preview blocked: ${preview?.preflight?.reason || pf?.reason || 'preconditions did not match'}.`);
    return `Input preview READY for ${pkg.summary}. Automated Vector writing is still locked; perform the one approved manual change, then record it in Rebel Command before verification.`;
  }

  async function verifyAction(pkg) {
    const date = visibleDate();
    if (date !== pkg.targetDate) throw new Error(`Open ListView for ${pkg.targetDate}; displayed date is ${date || 'unknown'}.`);
    const census = await freshGoodCensus();
    const pf = await preflight(pkg.packageKey);
    const matchesTarget = pf?.reason === 'already_in_target_state';
    const result = await request('', {
      method: 'POST',
      body: {
        version: VERSION,
        actionVerification: {
          packageKey: pkg.packageKey,
          displayedDate: date,
          sourceVersion: VERSION,
          match: matchesTarget,
          evidence: {
            freshCensusStatus: census.status,
            lastCapture: census.lastCapture || null,
            serverPreflight: pf,
            automatedWriteAttempted: false,
          },
        },
      },
    });
    if (!result?.actionVerification?.verified) throw new Error(`Reread did not match the intended ${pkg.actionType === 'schedule' ? 'schedule' : 'OT signup'} state.`);
    return `VERIFIED: ${pkg.summary}. The fresh Vector reread matches the intended state.`;
  }

  async function runPending() {
    const pending = loadJson(PENDING_KEY, {});
    if (!pending?.operation || !/^\d{4}-\d{2}-\d{2}$/.test(clean(pending.date))) return;
    if (!Number.isFinite(Number(pending.requestedAt)) || Date.now() - Number(pending.requestedAt) > 3 * 60 * 1000) {
      removeKey(PENDING_KEY);
      return;
    }

    const op = clean(pending.operation);
    if ((op === 'staffing' || op === 'action') && (!isListView() || visibleDate() !== pending.date)) return;
    if (op === 'overtime' && (!isRankingPage() || visibleDate() !== pending.date)) return;

    state.open = true;
    state.busy = true;
    render();
    try {
      let message = '';
      if (op === 'staffing') message = await collectStaffing(pending.date);
      else if (op === 'overtime') message = await collectOvertime(pending.date);
      else if (op === 'action') {
        const worklist = await refreshWorklist({ renderAfter: false });
        const pkg = worklist.find(p => p.packageKey === pending.packageKey);
        if (!pkg) throw new Error('The queued action package is no longer available. Refresh Rebel Command before trying again.');
        message = pkg.stage === 'reread_verification' ? await verifyAction(pkg) : await previewAction(pkg);
      }
      removeKey(PENDING_KEY);
      state.lastMessage = message;
      state.lastKind = /READY|VERIFIED|complete/i.test(message) ? 'success' : 'info';
      saveJson(STATUS_KEY, { message, kind: state.lastKind, at: Date.now() });
    } catch (error) {
      removeKey(PENDING_KEY);
      state.lastMessage = clean(error?.message || error);
      state.lastKind = 'error';
      saveJson(STATUS_KEY, { message: state.lastMessage, kind: 'error', at: Date.now() });
    } finally {
      state.busy = false;
      await refreshWorklist({ renderAfter: false });
      render();
    }
  }

  function navigateFor(operation, date, extra = {}) {
    savePending({ operation, date, ...extra });
    if (operation === 'overtime') {
      if (isRankingPage() && visibleDate() === date) runPending();
      else location.assign(rankingUrl(date));
      return;
    }
    if (isListView() && visibleDate() === date) runPending();
    else location.assign(listViewUrl(date));
  }

  async function startInput(actionType, date) {
    if (!paired()) { setMessage('Pair Rebel Command before using input controls.', 'error'); return; }
    state.busy = true; render();
    try {
      const list = await refreshWorklist({ renderAfter: false });
      const matches = list.filter(p => p.actionType === actionType && p.targetDate === date);
      if (!matches.length) {
        const label = actionType === 'schedule' ? 'schedule' : 'OT signup';
        throw new Error(`No ${label} action is queued for ${date}. Prepare/approve it in Rebel Command → Vector Actions first.`);
      }
      const pkg = matches[0];
      state.busy = false;
      navigateFor('action', pkg.targetDate, { packageKey: pkg.packageKey, actionType: pkg.actionType, stage: pkg.stage });
    } catch (error) {
      state.busy = false;
      setMessage(clean(error?.message || error), 'error');
    }
  }

  async function testConnection() {
    state.busy = true; render();
    try {
      const body = await request('');
      state.lastMessage = `Rebel Command connected. Device ${body?.deviceId || 'verified'}.`;
      state.lastKind = 'success';
      saveJson(STATUS_KEY, { message: state.lastMessage, kind: 'success', at: Date.now() });
    } catch (error) {
      state.lastMessage = `Connection failed: ${clean(error?.message || error)}`;
      state.lastKind = 'error';
    } finally {
      state.busy = false;
      render();
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #mvci-vs-open,#mvci-vs-panel,#vs-vector-bridge-v0200,#vector-overtime-collector-status,#mvci-global-launcher-v0230{display:none!important}
      #${ROOT_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483646;font-family:Arial,Helvetica,sans-serif;color:#253746}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .mvci-orb{width:54px;height:54px;border-radius:50%;border:3px solid #fff;background:#087eae;color:#fff;box-shadow:0 3px 14px rgba(0,0,0,.34);cursor:pointer;display:flex;align-items:center;justify-content:center;margin-left:auto;font-weight:900;font-size:24px;line-height:1;position:relative}
      #${ROOT_ID} .mvci-orb:after{content:'';position:absolute;right:2px;bottom:2px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #fff}
      #${ROOT_ID} .mvci-panel{width:370px;max-width:calc(100vw - 28px);margin-bottom:10px;border:1px solid #cbd8df;border-radius:11px;background:#f6f8f9;box-shadow:0 10px 30px rgba(0,0,0,.28);overflow:hidden}
      #${ROOT_ID} .mvci-head{background:#173e63;color:#fff;padding:13px 14px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      #${ROOT_ID} .mvci-title{font-size:16px;font-weight:800}.mvci-version{font-size:11px;font-weight:700;opacity:.8;margin-left:4px}
      #${ROOT_ID} .mvci-sub{font-size:10px;opacity:.72;margin-top:3px}
      #${ROOT_ID} .mvci-close{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.05);color:#fff;border-radius:7px;width:28px;height:28px;cursor:pointer;font-size:17px;line-height:1}
      #${ROOT_ID} .mvci-body{padding:11px}
      #${ROOT_ID} .mvci-user{background:#eaf0f3;border:1px solid #d6e0e5;border-radius:8px;padding:9px 10px;margin-bottom:9px;display:flex;justify-content:space-between;gap:10px;align-items:center}
      #${ROOT_ID} .mvci-user strong{font-size:11px}.mvci-user span{font-size:10px;color:#657984}
      #${ROOT_ID} .mvci-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px;background:#16a34a}.mvci-dot.off{background:#f59e0b}
      #${ROOT_ID} .mvci-date{display:grid;grid-template-columns:1fr auto;gap:7px;align-items:end;margin-bottom:9px}
      #${ROOT_ID} label{display:block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#657984;margin-bottom:3px}
      #${ROOT_ID} input[type=date]{width:100%;height:36px;border:1px solid #c5d2d9;border-radius:7px;background:#fff;color:#253746;padding:6px 8px;font:600 12px Arial}
      #${ROOT_ID} .mvci-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      #${ROOT_ID} .mvci-section-label{grid-column:1/-1;font-size:9px;font-weight:900;color:#657984;text-transform:uppercase;letter-spacing:.07em;margin-top:2px}
      #${ROOT_ID} .mvci-btn{min-height:44px;padding:9px 8px;border-radius:8px;border:1px solid #0b6d87;background:#0d7895;color:#fff;font:700 12px/1.2 Arial;cursor:pointer;box-shadow:none}
      #${ROOT_ID} .mvci-btn:hover{filter:brightness(1.05)}#${ROOT_ID} .mvci-btn:disabled{opacity:.5;cursor:not-allowed}
      #${ROOT_ID} .mvci-btn.input{background:#155e75;border-color:#155e75}#${ROOT_ID} .mvci-btn.secondary{background:#fff;color:#29495a;border-color:#c4d1d8;min-height:36px}
      #${ROOT_ID} .mvci-status{margin-top:9px;background:#fff;border:1px solid #dde5e9;border-radius:8px;padding:8px 9px;font-size:10px;line-height:1.35;color:#516873;min-height:34px}
      #${ROOT_ID} .mvci-status.success{border-color:#a7d9bd;background:#f0fbf5;color:#216340}#${ROOT_ID} .mvci-status.error{border-color:#efb2b2;background:#fff4f4;color:#8b2c2c}
      #${ROOT_ID} .mvci-foot{margin-top:8px;display:flex;gap:7px}#${ROOT_ID} .mvci-foot .mvci-btn{flex:1}
      #${ROOT_ID} .mvci-settings{margin-top:8px;padding-top:8px;border-top:1px solid #dde5e9;font-size:10px;color:#617681;line-height:1.45}
      #${ROOT_ID} .mvci-chip{display:inline-flex;padding:3px 6px;border-radius:999px;background:#fff2cc;border:1px solid #edd783;color:#705a00;font-weight:800;font-size:9px;margin-top:5px}
      @media(max-width:540px){#${ROOT_ID}{right:10px;bottom:10px}#${ROOT_ID} .mvci-panel{width:min(370px,calc(100vw - 20px))}}
    `;
    document.documentElement.appendChild(style);
  }

  function panelDate() {
    const current = document.querySelector(`#${ROOT_ID} #mvci-control-date`)?.value;
    return /^\d{4}-\d{2}-\d{2}$/.test(clean(current)) ? clean(current) : (visibleDate() || localToday());
  }

  function count(type, date) {
    return state.worklist.filter(p => p.actionType === type && (!date || p.targetDate === date)).length;
  }

  function render() {
    ensureStyle();
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }
    const preservedDate = panelDate();
    const runtime = clean(document.documentElement.dataset.mvciRuntimeVersion) || VERSION;
    const loader = clean(document.documentElement.dataset.mvciLoaderVersion) || '1.0.3';
    const date = preservedDate || localToday();
    const connected = paired();
    const scheduleCount = count('schedule', date);
    const otCount = count('overtime_signup', date);
    const message = state.busy ? 'Working… stay on this page until Mission Vector reports completion.' : (state.lastMessage || 'Choose a date, then use a collection or input control.');
    const panel = state.open ? `
      <div class="mvci-panel">
        <div class="mvci-head"><div><div class="mvci-title">Mission Vector <span class="mvci-version">${esc(runtime)}</span></div><div class="mvci-sub">Scheduling + Overtime controls</div></div><button id="mvci-control-close" class="mvci-close" type="button">−</button></div>
        <div class="mvci-body">
          <div class="mvci-user"><div><strong>Michael Brion</strong><br><span>Rebel Command · Scheduling / OT</span></div><div><span class="mvci-dot ${connected?'':'off'}"></span><span>${connected?'Connected':'Pairing needed'}</span></div></div>
          <div class="mvci-date"><div><label for="mvci-control-date">Work date</label><input id="mvci-control-date" type="date" value="${esc(date)}"></div><button id="mvci-control-refresh" class="mvci-btn secondary" type="button" ${state.busy?'disabled':''}>Refresh</button></div>
          <div class="mvci-grid">
            <div class="mvci-section-label">Collect / scrape</div>
            <button id="mvci-control-staffing" class="mvci-btn" type="button" ${state.busy?'disabled':''}>Collect Staffing</button>
            <button id="mvci-control-ot" class="mvci-btn" type="button" ${state.busy?'disabled':''}>Collect OT Priority</button>
            <div class="mvci-section-label">Input / verify</div>
            <button id="mvci-control-input-schedule" class="mvci-btn input" type="button" ${state.busy?'disabled':''}>Input Schedule${scheduleCount?` · ${scheduleCount}`:''}</button>
            <button id="mvci-control-input-ot" class="mvci-btn input" type="button" ${state.busy?'disabled':''}>Input OT Signup${otCount?` · ${otCount}`:''}</button>
          </div>
          <div class="mvci-status ${state.lastKind==='success'?'success':state.lastKind==='error'?'error':''}">${esc(message)}</div>
          <div class="mvci-foot"><button id="mvci-control-settings" class="mvci-btn secondary" type="button">Settings</button><button id="mvci-control-check" class="mvci-btn secondary" type="button" ${state.busy?'disabled':''}>Check Connection</button></div>
          ${state.settingsOpen?`<div class="mvci-settings"><b>Loader:</b> ${esc(loader)} · <b>Runtime:</b> ${esc(runtime)}<br><b>Page:</b> ${esc(isListView()?'Vector ListView':isRankingPage()?'Global OT Rankings':'CrewSense')} · <b>Displayed date:</b> ${esc(visibleDate()||'unknown')}<br><span class="mvci-chip">AUTO-WRITE LOCK ON</span><div style="margin-top:5px">The input buttons currently navigate, collect a fresh census, run package preflight, and verify rereads. They do not submit an automated Vector write until the manual proof gate is completed and PRIMARY explicitly enables it.</div></div>`:''}
        </div>
      </div>` : '';
    root.innerHTML = `${panel}<button id="mvci-control-orb" class="mvci-orb" type="button" title="Mission Vector controls">V</button>`;

    root.querySelector('#mvci-control-orb')?.addEventListener('click', async () => {
      state.open = !state.open;
      if (state.open) await refreshWorklist({ renderAfter: false });
      render();
    });
    root.querySelector('#mvci-control-close')?.addEventListener('click', () => { state.open = false; render(); });
    root.querySelector('#mvci-control-refresh')?.addEventListener('click', async () => { await refreshWorklist(); });
    root.querySelector('#mvci-control-settings')?.addEventListener('click', () => { state.settingsOpen = !state.settingsOpen; render(); });
    root.querySelector('#mvci-control-check')?.addEventListener('click', testConnection);
    root.querySelector('#mvci-control-staffing')?.addEventListener('click', () => {
      const d = panelDate();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return setMessage('Choose a valid date first.', 'error');
      navigateFor('staffing', d);
    });
    root.querySelector('#mvci-control-ot')?.addEventListener('click', () => {
      const d = panelDate();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return setMessage('Choose a valid date first.', 'error');
      navigateFor('overtime', d);
    });
    root.querySelector('#mvci-control-input-schedule')?.addEventListener('click', () => startInput('schedule', panelDate()));
    root.querySelector('#mvci-control-input-ot')?.addEventListener('click', () => startInput('overtime_signup', panelDate()));
  }

  loadLastMessage();
  render();
  setTimeout(() => refreshWorklist(), 900);
  setTimeout(runPending, 1400);
  window.addEventListener('hashchange', () => setTimeout(runPending, 700));

  window.MVCI_CONTROL_PANEL_0240 = {
    version: VERSION,
    refreshWorklist,
    runPending,
    collectStaffing,
    collectOvertime,
    startInput,
    status: () => ({ paired: paired(), busy: state.busy, worklist: state.worklist.length, lastMessage: state.lastMessage }),
  };
})();
