// ==UserScript==
// @name         Mission Vector Check It - Vector Scheduling DEV
// @namespace    mission-vector-check-it-scheduling
// @version      0.4.2-dev
// @description  Read-only Truck 504 scheduling bootstrap with update button, legacy import, page capture, and partial-day tracking.
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js
// @match        https://crewsense.com/*
// @match        https://*.crewsense.com/*
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/rotation-engine.js
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/horizon-planner.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.4.2-dev';
  const UPDATE_URL = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js';
  const KEY = 'missionVectorScheduling_v3';
  const LEGACY_KEYS = ['missionVectorScheduling_v2', 'missionVectorScheduling_v1'];
  const Engine = window.VectorSchedulingEngine;

  if (!Engine) {
    console.error('Vector Scheduling DEV: rotation engine did not load.');
    return;
  }
  if (window.__mvciVectorScheduling) return;
  window.__mvciVectorScheduling = { version: VERSION, startedAt: Date.now() };

  const DEFAULT = {
    schemaVersion: 3,
    settings: {
      apparatusName: 'Truck 504',
      firefighters: [],
      command: [],
      balanceStartDate: null,
      balanceEndDate: null,
      blockDays: 2,
      horizonBlocks: 12,
      shiftLengthHours: 24
    },
    history: [],
    dutyHistory: [],
    plans: [],
    observations: [],
    reviews: [],
    resolutions: [],
    segments: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastCaptureAt: null,
      lastImportAt: null
    }
  };

  const clone = x => JSON.parse(JSON.stringify(x));
  const clean = x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const uid = (...parts) => parts.map(v => clean(v).toLowerCase()).join('|');

  function normalize(raw) {
    const x = raw && typeof raw === 'object' ? raw : {};
    const s = {
      ...clone(DEFAULT),
      ...x,
      settings: { ...DEFAULT.settings, ...(x.settings || {}) },
      metadata: { ...DEFAULT.metadata, ...(x.metadata || {}) }
    };
    for (const k of ['history', 'dutyHistory', 'plans', 'observations', 'reviews', 'resolutions', 'segments']) {
      if (!Array.isArray(s[k])) s[k] = [];
    }
    if (!Array.isArray(s.settings.firefighters)) s.settings.firefighters = [];
    if (!Array.isArray(s.settings.command)) s.settings.command = [];
    s.schemaVersion = 3;
    return s;
  }

  function loadState() {
    try {
      const current = localStorage.getItem(KEY);
      if (current) return normalize(JSON.parse(current));
      for (const key of LEGACY_KEYS) {
        const old = localStorage.getItem(key);
        if (old) return normalize(JSON.parse(old));
      }
    } catch (err) {
      console.warn('Vector Scheduling DEV: state load failed', err);
    }
    return normalize(null);
  }

  let state = loadState();
  function saveState() {
    state.metadata.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  saveState();

  function people() { return [...state.settings.firefighters, ...state.settings.command]; }
  function firefighterIds() { return state.settings.firefighters.map(p => p.id); }
  function person(id) { return people().find(p => p.id === id) || { id, name: id }; }
  function upsert(list, row, keyFn) {
    const key = keyFn(row);
    const i = list.findIndex(x => keyFn(x) === key);
    if (i >= 0) list[i] = row;
    else list.push(row);
  }

  function mergeImport(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid JSON file.');
    if (payload.settings) state.settings = { ...state.settings, ...payload.settings };

    const keys = {
      history: x => uid(x.date, x.personId, x.credit, x.detail),
      dutyHistory: x => uid(x.date, x.personId, x.detail, x.source),
      plans: x => uid(x.date, x.personId),
      observations: x => uid(x.date, x.personId, x.capturedAt, x.source),
      reviews: x => uid(x.date, x.personId, x.observationCapturedAt),
      resolutions: x => uid(x.date, x.personId, x.resolvedAt),
      segments: x => uid(x.date, x.personId, x.role, x.startTime, x.endTime)
    };

    for (const [k, fn] of Object.entries(keys)) {
      for (const row of (payload[k] || [])) upsert(state[k], row, fn);
    }
    state.metadata.lastImportAt = new Date().toISOString();
    saveState();
  }

  function stats() {
    return Engine.statsFromHistory(
      state.history,
      firefighterIds(),
      state.settings.balanceStartDate || null,
      state.settings.balanceEndDate || null
    );
  }

  function pageDate() {
    const text = clean(document.body?.innerText || '');
    const direct = Engine.parseDateFromText(text);
    if (direct) return direct;
    const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    return m ? `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : null;
  }

  function bestPersonContainer(name) {
    const needle = clean(name).toLowerCase();
    let best = null;
    let bestScore = -Infinity;

    const nodes = [...document.querySelectorAll('body *')].filter(el => {
      const text = clean(el.textContent || '').toLowerCase();
      return text.includes(needle) && text.length < 1800;
    });

    for (const start of nodes) {
      let el = start;
      for (let depth = 0; el && depth < 7; depth++, el = el.parentElement) {
        const text = clean(el.innerText || '');
        if (!text.toLowerCase().includes(needle) || text.length > 1800) continue;
        let score = 0;
        if (el.matches?.('tr, li, [role="row"], .row, .list-group-item')) score += 5;
        for (const word of ['Truck', 'Engine', 'Medic', 'Deployment', 'Training', 'Vacation', 'Holiday', 'Sick', 'Leave', 'FFB', 'TM', 'DE-A', 'Capt', 'TAC', 'TADE', 'Swing']) {
          if (new RegExp(`\\b${word}\\b`, 'i').test(text)) score += 1;
        }
        score -= text.length / 500;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
    return best;
  }

  function capturePage() {
    const date = pageDate();
    if (!date) throw new Error('Could not determine the displayed Vector date.');
    if (!people().length) throw new Error('Import the private Truck 504 JSON first.');

    const capturedAt = new Date().toISOString();
    for (const p of people()) {
      const el = bestPersonContainer(p.name);
      const rawText = clean(el?.innerText || '');
      const row = {
        date,
        personId: p.id,
        personName: p.name,
        capturedAt,
        rawText,
        dutyCode: Engine.detectDutyCode(rawText),
        assignment: Engine.detectAssignment(rawText),
        found: !!el,
        source: 'vector-dom-readonly'
      };
      upsert(state.observations, row, x => uid(x.date, x.personId, x.capturedAt, x.source));
    }
    state.metadata.lastCaptureAt = capturedAt;
    saveState();
    return date;
  }

  function segmentHours(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite)) return null;
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 1440;
    return diff / 60;
  }

  function addPartialSegment(date, personId, role, startTime, endTime, note) {
    const durationHours = segmentHours(startTime, endTime);
    if (!date || !personId || !role || !durationHours) throw new Error('Complete all partial-duty fields.');
    const row = {
      date,
      personId,
      role,
      startTime,
      endTime,
      durationHours,
      fractionOfShift: Math.min(1, durationHours / Number(state.settings.shiftLengthHours || 24)),
      countsTowardRotation: false,
      verified: true,
      source: 'manual-partial-duty',
      note: clean(note),
      createdAt: new Date().toISOString()
    };
    upsert(state.segments, row, x => uid(x.date, x.personId, x.role, x.startTime, x.endTime));
    saveState();
    return row;
  }

  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vector-scheduling-private-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function installCss() {
    if (document.getElementById('mvci-vs-style')) return;
    const s = document.createElement('style');
    s.id = 'mvci-vs-style';
    s.textContent = `
#mvci-vs-open{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:60px;height:60px;border:0;border-radius:50%;background:#17365d;color:#fff;font:700 14px Arial;cursor:pointer;box-shadow:0 3px 14px #0006}
#mvci-vs-panel{position:fixed;right:0;top:0;width:min(560px,97vw);height:100vh;z-index:2147483647;background:#f7f9fc;color:#17202a;font:13px/1.4 Arial;box-shadow:-4px 0 18px #0005;overflow:auto}
#mvci-vs-panel *{box-sizing:border-box}.vs-head{display:flex;gap:8px;align-items:center;background:#17365d;color:#fff;padding:12px}.vs-head strong{flex:1;font-size:16px}.vs-card{background:#fff;border:1px solid #d8e0e9;border-radius:8px;padding:10px;margin:10px}.vs-card h3{margin:0 0 8px}.vs-btn{padding:7px 10px;border:1px solid #315a88;border-radius:5px;background:#315a88;color:#fff;cursor:pointer}.vs-btn.secondary{background:#fff;color:#17365d}.vs-update{background:#f0b429;border-color:#f0b429;color:#111;font-weight:700}.vs-input,.vs-select{width:100%;padding:6px;border:1px solid #aebdce;border-radius:5px}.vs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.vs-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.vs-table{width:100%;border-collapse:collapse;font-size:12px}.vs-table th,.vs-table td{border-bottom:1px solid #e2e7ed;padding:5px;text-align:left}.vs-muted{font-size:11px;color:#687787}
`;
    document.head.appendChild(s);
  }

  function renderPanel() {
    installCss();
    let panel = document.getElementById('mvci-vs-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'mvci-vs-panel';
      document.body.appendChild(panel);
    }

    const s = stats();
    const ids = firefighterIds();
    const options = state.settings.firefighters.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    const recent = [...state.segments].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);

    panel.innerHTML = `
<div class="vs-head">
  <strong>Vector Scheduling DEV <span style="opacity:.7;font-size:11px">${VERSION}</span></strong>
  <button class="vs-btn vs-update" id="vs-update">↻ UPDATE</button>
  <button class="vs-btn secondary" id="vs-close">×</button>
</div>
<div class="vs-card">
  <h3>Confirmed full-shift rotation</h3>
  ${ids.length ? `<table class="vs-table"><tr><th>Firefighter</th>${Engine.CREDIT_CATEGORIES.map(c => `<th>${c}</th>`).join('')}<th>Total</th></tr>${ids.map(id => `<tr><td><strong>${esc(person(id).name)}</strong></td>${Engine.CREDIT_CATEGORIES.map(c => `<td>${(((s[id]?.ratios?.[c] || 0) * 100)).toFixed(1)}%</td>`).join('')}<td>${s[id]?.total || 0}</td></tr>`).join('')}</table>` : '<div>Import the private Truck 504 JSON below.</div>'}
</div>
<div class="vs-card">
  <h3>Read current Vector page</h3>
  <button class="vs-btn" id="vs-capture">Capture displayed date</button>
  <div class="vs-muted" style="margin-top:6px">Read-only. This records what the page appears to show; it does not change Vector.</div>
  <div class="vs-muted" style="margin-top:4px">Last capture: ${esc(state.metadata.lastCaptureAt ? new Date(state.metadata.lastCaptureAt).toLocaleString() : 'none')}</div>
</div>
<div class="vs-card">
  <h3>Partial-day duty exposure</h3>
  <div class="vs-grid3">
    <div><label>Date</label><input id="seg-date" class="vs-input" type="date" value="${esc(pageDate() || today())}"></div>
    <div><label>Firefighter</label><select id="seg-person" class="vs-select">${options}</select></div>
    <div><label>Role</label><select id="seg-role" class="vs-select"><option>TADE</option><option>Tiller</option><option>Swing</option><option>Firefighter</option></select></div>
  </div>
  <div class="vs-grid3" style="margin-top:7px">
    <div><label>Start</label><input id="seg-start" class="vs-input" type="time" value="07:00"></div>
    <div><label>End</label><input id="seg-end" class="vs-input" type="time" value="12:00"></div>
    <div><label>Note</label><input id="seg-note" class="vs-input" placeholder="class coverage"></div>
  </div>
  <button class="vs-btn secondary" id="seg-add" style="margin-top:7px">Record partial duty</button>
  <div class="vs-muted" style="margin-top:6px">Partial coverage is tracked precisely but does not count as a whole rotation day. The two-shift seat plan will stay intact whenever staffing allows.</div>
</div>
${recent.length ? `<div class="vs-card"><h3>Recent partial coverage</h3><table class="vs-table"><tr><th>Date</th><th>Person</th><th>Role</th><th>Time</th><th>Hours</th></tr>${recent.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(person(x.personId).name)}</td><td>${esc(x.role)}</td><td>${esc(x.startTime)}–${esc(x.endTime)}</td><td>${Number(x.durationHours || 0).toFixed(1)}</td></tr>`).join('')}</table></div>` : ''}
<div class="vs-card">
  <h3>Import / export</h3>
  <input id="vs-import" class="vs-input" type="file" accept=".json,application/json">
  <div style="margin-top:7px"><button class="vs-btn secondary" id="vs-export">Export private state JSON</button></div>
</div>
`;

    panel.querySelector('#vs-close').onclick = () => panel.remove();
    panel.querySelector('#vs-update').onclick = () => {
      window.open(UPDATE_URL, '_blank', 'noopener');
    };
    panel.querySelector('#vs-capture').onclick = () => {
      try {
        const d = capturePage();
        alert(`Captured read-only Vector evidence for ${d}.`);
        renderPanel();
      } catch (err) {
        alert(`Capture failed: ${err.message}`);
      }
    };
    panel.querySelector('#seg-add').onclick = () => {
      try {
        const row = addPartialSegment(
          panel.querySelector('#seg-date').value,
          panel.querySelector('#seg-person').value,
          panel.querySelector('#seg-role').value,
          panel.querySelector('#seg-start').value,
          panel.querySelector('#seg-end').value,
          panel.querySelector('#seg-note').value
        );
        alert(`Recorded ${person(row.personId).name} ${row.role} for ${row.durationHours.toFixed(1)} hour(s). No full-shift rotation credit was added.`);
        renderPanel();
      } catch (err) {
        alert(err.message);
      }
    };
    panel.querySelector('#vs-import').onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        mergeImport(JSON.parse(await file.text()));
        alert(`Imported ${file.name}.`);
        renderPanel();
      } catch (err) {
        alert(`Import failed: ${err.message}`);
      }
    };
    panel.querySelector('#vs-export').onclick = exportState;
  }

  function init() {
    installCss();
    if (document.getElementById('mvci-vs-open')) return;
    const b = document.createElement('button');
    b.id = 'mvci-vs-open';
    b.textContent = 'VS';
    b.title = 'Vector Scheduling DEV';
    b.onclick = renderPanel;
    document.body.appendChild(b);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();