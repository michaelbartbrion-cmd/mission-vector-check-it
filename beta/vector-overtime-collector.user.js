// ==UserScript==
// @name         Mission Vector Check It - Overtime Collector
// @namespace    mission-vector-check-it
// @version      0.3.0
// @description  Read-only CrewSense overtime ranking collector for Rebel Command.
// @match        https://www.crewsense.com/*
// @match        https://crewsense.com/*
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-overtime-collector.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-overtime-collector.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__vectorOvertimeCollector) return;
  window.__vectorOvertimeCollector = true;

  const VERSION = '0.3.0';
  const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const PAIR_KEY = 'vectorOvertimeCollectorPairing_v1';
  const SHARED_PAIR_KEY = 'vectorStaffingCollectorPairing_v1';
  const STATE_KEY = 'vectorOvertimeCollectorState_v1';
  const UI_ID = 'vector-overtime-collector-status';
  const STABLE_MS = 900;
  const COOLDOWN_MS = 12000;
  const MIN_COMPLETE_ROWS = 80;

  const state = {
    lastMutationAt: Date.now(),
    running: false,
    lastDigest: '',
    lastSentAt: 0,
    status: 'idle',
    lastError: '',
  };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function loadJSON(key, fallback = {}) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function normalizedPair(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    return {
      deviceId: clean(p.deviceId),
      token: clean(p.token),
      endpoint: clean(p.endpoint) || ENDPOINT,
    };
  }

  function pairing() {
    const own = normalizedPair(loadJSON(PAIR_KEY));
    if (own.deviceId && own.token) return own;
    const shared = normalizedPair(loadJSON(SHARED_PAIR_KEY));
    if (shared.deviceId && shared.token) {
      saveJSON(PAIR_KEY, shared);
      return shared;
    }
    return own;
  }

  function isPaired() {
    const p = pairing();
    return !!(p.deviceId && p.token);
  }

  function rendered(el) {
    if (!el || !(el instanceof Element)) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isRankingPage() {
    return /\/Application\/ControlPanel\/CallbackModule\/Rankings/i.test(location.pathname)
      || (/rankings/i.test(clean(document.body?.textContent)) && /overtime list/i.test(clean(document.body?.textContent)));
  }

  function parseDateString(value) {
    const text = clean(value);
    let m = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;
    m = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
    if (m) return `${m[3]}-${String(Number(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;
    return '';
  }

  function findForecastControls() {
    const labels = [...document.querySelectorAll('label,div,span,p')]
      .filter(rendered)
      .filter(el => /select date to forecast rankings/i.test(clean(el.textContent)));
    const label = labels.sort((a,b) => clean(a.textContent).length - clean(b.textContent).length)[0];
    if (!label) return null;

    let scope = label.parentElement;
    for (let depth = 0; scope && depth < 8; depth += 1, scope = scope.parentElement) {
      const inputs = [...scope.querySelectorAll('input')]
        .filter(rendered)
        .filter(el => parseDateString(el.value));
      if (!inputs.length) continue;
      const input = inputs[0];
      const buttons = [...scope.querySelectorAll('button')].filter(rendered);
      if (!buttons.length) continue;
      return { label, scope, input, buttons };
    }
    return null;
  }

  function detectForecastDate() {
    const controls = findForecastControls();
    if (controls) {
      const date = parseDateString(controls.input.value);
      if (date) return { date, confidence: 'high', source: 'forecast-date-input' };
    }
    const dates = [...document.querySelectorAll('input')]
      .filter(rendered)
      .map(el => parseDateString(el.value))
      .filter(Boolean);
    const unique = [...new Set(dates)];
    return unique.length === 1
      ? { date: unique[0], confidence: 'high', source: 'unique-date-input' }
      : { date: '', confidence: 'none', source: 'not-found' };
  }

  function loadingVisible() {
    return [...document.querySelectorAll('[aria-busy="true"],.loading,.spinner,[class*="loading"],[class*="spinner"]')]
      .some(rendered);
  }

  function parseRankingText(text) {
    const t = clean(text);
    if (t.length < 10 || t.length > 500) return null;
    const m = t.match(/^(\d{1,3})\.\s+(.+?)\s+(-?[\d,]+(?:\.\d+)?)\s*hrs?\s*(?:\((.*?)\))?\s*$/i);
    if (!m) return null;
    const rank = Number(m[1]);
    const hours = Number(m[3].replace(/,/g, ''));
    const personName = clean(m[2]);
    if (!Number.isInteger(rank) || rank < 1 || !Number.isFinite(hours) || hours < 0 || !personName) return null;
    return { rank, personName, overtimeHours: hours, tieBreakText: clean(m[4] || ''), rawText: t };
  }

  function rankingElements(root = document) {
    const pool = [...root.querySelectorAll('tr,[role="row"],li,article,div')]
      .filter(el => el.id !== UI_ID && !el.closest(`#${UI_ID}`))
      .map(el => ({ el, parsed: parseRankingText(el.textContent) }))
      .filter(x => x.parsed);
    const selected = [];
    for (const item of pool.sort((a,b) => clean(a.el.textContent).length - clean(b.el.textContent).length)) {
      if (selected.some(x => item.el.contains(x.el))) continue;
      selected.push(item);
    }
    return selected;
  }

  function mergeRows(map, items) {
    for (const item of items) if (item.parsed) map.set(item.parsed.rank, item.parsed);
  }

  function findScroller(el) {
    let node = el?.parentElement || null;
    for (let i = 0; node && i < 14; i += 1, node = node.parentElement) {
      const s = getComputedStyle(node);
      if (node.scrollHeight > node.clientHeight + 80 && /(auto|scroll)/i.test(s.overflowY || '')) return node;
    }
    return document.scrollingElement || document.documentElement;
  }

  async function sweepRanking() {
    const rows = new Map();
    const first = rankingElements();
    mergeRows(rows, first);
    const scroller = findScroller(first[0]?.el);
    const isDoc = scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body;
    const original = isDoc ? window.scrollY : scroller.scrollTop;
    const viewport = isDoc ? window.innerHeight : scroller.clientHeight;
    const max = isDoc ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight) : Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const step = Math.max(240, Math.floor(viewport * 0.72));
    let bottom = max === 0;
    try {
      for (let pos = 0, loops = 0; pos <= max + step && loops < 180; pos += step, loops += 1) {
        const target = Math.min(pos, max);
        if (isDoc) window.scrollTo(0, target); else scroller.scrollTop = target;
        await wait(70);
        mergeRows(rows, rankingElements(isDoc ? document : scroller));
        const current = isDoc ? window.scrollY : scroller.scrollTop;
        if (current >= max - 4) { bottom = true; break; }
      }
    } finally {
      if (isDoc) window.scrollTo(0, original); else scroller.scrollTop = original;
      await wait(100);
    }
    mergeRows(rows, rankingElements());
    return { rows: [...rows.values()].sort((a,b) => a.rank - b.rank), bottom };
  }

  async function waitStable(maxWait = 6000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      if (Date.now() - state.lastMutationAt >= STABLE_MS && !loadingVisible()) return true;
      await wait(100);
    }
    return false;
  }

  function diagnostics(rows, dateInfo, bottom) {
    const sequential = rows.length > 0 && rows.every((r,i) => r.rank === i + 1);
    const uniqueNames = new Set(rows.map(r => clean(r.personName).toLowerCase())).size === rows.length;
    const michael = rows.find(r => clean(r.personName).toLowerCase() === 'michael brion');
    return {
      pageStable: Date.now() - state.lastMutationAt >= STABLE_MS,
      noLoadingIndicator: !loadingVisible(),
      dateConfidence: dateInfo.confidence,
      sequential,
      uniqueNames,
      michaelFound: !!michael,
      michaelRank: michael?.rank || null,
      michaelHours: michael?.overtimeHours ?? null,
      scrollSweepComplete: bottom,
    };
  }

  function statusText() {
    if (!isPaired()) return 'OT PRIORITY · pair Scheduling first';
    if (state.running) return 'OT PRIORITY · reading…';
    if (state.status === 'sent-good') return 'OT PRIORITY · sent ✓';
    if (state.status === 'sent-partial') return 'OT PRIORITY · sent · verify';
    if (state.status === 'error') return `OT PRIORITY · error`;
    return 'OT PRIORITY · capture';
  }

  function renderStatus() {
    if (!isRankingPage()) {
      document.getElementById(UI_ID)?.remove();
      return;
    }

    let button = document.getElementById(UI_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = UI_ID;
      button.type = 'button';
      button.title = 'Capture the displayed Global OT List into Rebel Command. Uses the same pairing as the Scheduling bridge.';
      button.addEventListener('click', () => captureRanking({ force: true }));
      document.body.appendChild(button);
    }

    button.textContent = statusText();
    button.style.cssText = [
      'z-index:2147483646','border:1px solid #2563eb','border-radius:6px',
      'background:#0f172a','color:#f8fafc','padding:8px 12px','font:600 12px/1.2 system-ui,sans-serif',
      'box-shadow:0 2px 8px rgba(0,0,0,.22)','cursor:pointer','white-space:nowrap'
    ].join(';');

    const controls = findForecastControls();
    if (controls) {
      const anchor = controls.buttons[controls.buttons.length - 1];
      const parent = anchor?.parentElement || controls.scope;
      button.style.position = 'static';
      button.style.marginLeft = '8px';
      button.style.verticalAlign = 'middle';
      if (button.parentElement !== parent || button.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', button);
    } else {
      button.style.position = 'fixed';
      button.style.top = '205px';
      button.style.right = '24px';
      button.style.marginLeft = '0';
    }
  }

  async function postRanking(payload) {
    const p = pairing();
    if (!p.deviceId || !p.token) throw new Error('Scheduling bridge is not paired yet.');
    const response = await fetch(p.endpoint || ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.token}`,
        'X-Rebel-Device-ID': p.deviceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: VERSION, rankingCapture: payload }),
      cache: 'no-store',
      credentials: 'omit',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) throw new Error(body?.error || `Rebel Command rejected ranking capture (${response.status})`);
    return body;
  }

  async function captureRanking({ force = false } = {}) {
    if (state.running || !isRankingPage()) return { skipped: true, reason: 'busy-or-not-ranking-page' };
    if (!isPaired()) {
      state.status = 'error';
      state.lastError = 'Pair the Scheduling bridge first; this collector now reuses that pairing automatically.';
      renderStatus();
      alert(state.lastError);
      return { skipped: true, reason: 'not-paired' };
    }

    state.running = true;
    state.status = 'reading';
    renderStatus();
    try {
      await waitStable();
      const before = detectForecastDate();
      if (!before.date) throw new Error('Could not identify the Global OT List forecast date.');
      const sweep = await sweepRanking();
      await waitStable(2500);
      const after = detectForecastDate();
      if (after.date !== before.date) throw new Error('Forecast date changed during capture. Try again.');

      const rows = sweep.rows;
      if (!rows.length) throw new Error('No overtime ranking rows were found.');
      const diag = diagnostics(rows, before, sweep.bottom);
      const digest = `${before.date}|${rows.length}|${rows.map(r => `${r.rank}:${r.personName}:${r.overtimeHours}:${r.tieBreakText}`).join('|')}`;
      if (!force && digest === state.lastDigest && Date.now() - state.lastSentAt < COOLDOWN_MS) return { skipped: true, reason: 'duplicate-cooldown' };

      const payload = {
        batchId: `ranking:${before.date}:${Date.now().toString(36)}`,
        forecastDate: before.date,
        capturedAt: new Date().toISOString(),
        sourceVersion: VERSION,
        tier: 'Tier 1',
        pageUrl: location.href,
        rows,
        captureComplete: rows.length >= MIN_COMPLETE_ROWS && diag.sequential && diag.uniqueNames && diag.michaelFound && diag.scrollSweepComplete,
        diagnostics: diag,
      };
      const body = await postRanking(payload);
      state.lastDigest = digest;
      state.lastSentAt = Date.now();
      state.status = body?.ranking?.quality === 'good' ? 'sent-good' : 'sent-partial';
      state.lastError = '';
      saveJSON(STATE_KEY, { lastDigest: state.lastDigest, lastSentAt: state.lastSentAt, lastDate: before.date, rows: rows.length, version: VERSION });
      renderStatus();
      return body;
    } catch (err) {
      state.status = 'error';
      state.lastError = String(err?.message || err);
      console.warn('Mission Vector Check It OT collector:', err);
      renderStatus();
      alert(`OT ranking capture failed: ${state.lastError}`);
      return { ok: false, error: state.lastError };
    } finally {
      state.running = false;
      renderStatus();
    }
  }

  const prior = loadJSON(STATE_KEY, {});
  state.lastDigest = clean(prior.lastDigest);
  state.lastSentAt = Number(prior.lastSentAt) || 0;

  const observer = new MutationObserver(() => {
    state.lastMutationAt = Date.now();
    clearTimeout(observer._mvcTimer);
    observer._mvcTimer = setTimeout(renderStatus, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  renderStatus();
  setTimeout(renderStatus, 500);
  setTimeout(renderStatus, 1500);

  window.__vectorOvertimeCollector = {
    version: VERSION,
    capture: () => captureRanking({ force: true }),
    pairing,
    state,
  };
})();
