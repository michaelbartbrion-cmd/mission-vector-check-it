(function () {
  'use strict';

  const VERSION = '0.23.0-dev';
  const ROOT_ID = 'mvci-global-launcher-v0230';
  const STYLE_ID = 'mvci-global-launcher-style-v0230';
  const PENDING_KEY = 'mvciPendingCollection_v1';
  const RANKING_PATH_KEY = 'mvciLastRankingPath_v1';
  const DEFAULT_RANKING_PATH = '/Application/ControlPanel/CallbackModule/Rankings/63542/95668';
  const PAIR_KEY = 'vectorStaffingCollectorPairing_v1';

  if (window.top !== window.self || window.__mvciGlobalLauncher0230) return;
  window.__mvciGlobalLauncher0230 = { version: VERSION, startedAt: Date.now() };

  const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function loadJson(key, fallback = {}) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function removeKey(key) { try { localStorage.removeItem(key); } catch (_) {} }

  function parseDate(value) {
    const text = clean(value).replace(/^#/, '');
    let m = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
    m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
    if (m) return `${m[3]}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
    return '';
  }

  function localToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function visibleDate() {
    const candidates = [location.hash, location.pathname, location.search];
    for (const value of candidates) {
      const parsed = parseDate(value);
      if (parsed) return parsed;
    }
    const dates = [...document.querySelectorAll('input')].map(el => parseDate(el.value)).filter(Boolean);
    const unique = [...new Set(dates)];
    return unique.length === 1 ? unique[0] : '';
  }

  function isListView() { return /\/Application\/ControlPanel\/ListView/i.test(location.pathname); }
  function isRankingPage() { return /\/Application\/ControlPanel\/CallbackModule\/Rankings/i.test(location.pathname); }

  if (isRankingPage()) saveJson(RANKING_PATH_KEY, { path: location.pathname, at: Date.now() });

  function pairingReady() {
    const p = loadJson(PAIR_KEY, {});
    return !!(clean(p.deviceId) && clean(p.token));
  }

  function dateForUrl(date) {
    const [y, m, d] = date.split('-');
    return { hash: `${y}/${m}/${d}`, us: `${m}/${d}/${y}` };
  }

  function setPending(type, date) {
    saveJson(PENDING_KEY, { type, date, requestedAt: Date.now(), version: VERSION });
  }

  function goStaffing(date) {
    const f = dateForUrl(date);
    setPending('staffing', date);
    location.assign(`${location.origin}/Application/ControlPanel/ListView/#${f.hash}`);
  }

  function goOvertime(date) {
    const f = dateForUrl(date);
    const stored = loadJson(RANKING_PATH_KEY, {});
    const path = /^\/Application\/ControlPanel\/CallbackModule\/Rankings\//i.test(clean(stored.path)) ? clean(stored.path) : DEFAULT_RANKING_PATH;
    setPending('overtime', date);
    location.assign(`${location.origin}${path}?shift_date=${encodeURIComponent(f.us)}&select-date=`);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #vector-overtime-collector-status{display:none!important}
      #${ROOT_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483645;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#f8fafc}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .mvci-launch{border:1px solid #2563eb;background:#0f172a;color:#fff;border-radius:999px;padding:10px 14px;font-weight:800;font-size:12px;letter-spacing:.02em;box-shadow:0 6px 24px rgba(0,0,0,.28);cursor:pointer}
      #${ROOT_ID} .mvci-menu{width:310px;margin-bottom:8px;border:1px solid #334155;background:#0f172a;border-radius:12px;padding:12px;box-shadow:0 12px 34px rgba(0,0,0,.35)}
      #${ROOT_ID} .mvci-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      #${ROOT_ID} .mvci-title{font-size:14px;font-weight:800}.mvci-sub{font-size:11px;color:#94a3b8;margin-top:2px}
      #${ROOT_ID} .mvci-close{border:0;background:transparent;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1}
      #${ROOT_ID} .mvci-date{width:100%;border:1px solid #475569;background:#020617;color:#f8fafc;border-radius:8px;padding:8px 9px;font:600 13px system-ui,sans-serif}
      #${ROOT_ID} .mvci-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
      #${ROOT_ID} .mvci-btn{border:1px solid #334155;background:#1e293b;color:#f8fafc;border-radius:8px;padding:9px 8px;font:700 12px/1.2 system-ui,sans-serif;cursor:pointer;text-align:center}
      #${ROOT_ID} .mvci-btn.primary{background:#1d4ed8;border-color:#3b82f6}.mvci-btn:hover{filter:brightness(1.08)}
      #${ROOT_ID} .mvci-status{margin-top:9px;padding-top:9px;border-top:1px solid #1e293b;color:#94a3b8;font-size:11px;display:flex;justify-content:space-between;gap:8px}
      #${ROOT_ID} .mvci-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;background:#10b981}.mvci-dot.off{background:#f59e0b}
      #${ROOT_ID} .mvci-toast{margin-bottom:8px;width:310px;border:1px solid #334155;background:#111827;color:#f8fafc;border-radius:9px;padding:9px 11px;font:600 12px/1.3 system-ui,sans-serif;box-shadow:0 7px 22px rgba(0,0,0,.28)}
    `;
    document.documentElement.appendChild(style);
  }

  function toast(message, timeout = 7000) {
    ensureRoot();
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    let el = root.querySelector('.mvci-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'mvci-toast';
      root.prepend(el);
    }
    el.textContent = message;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { try { el.remove(); } catch (_) {} }, timeout);
  }

  function menuHtml(open) {
    if (!open) return '';
    const date = visibleDate() || localToday();
    const paired = pairingReady();
    return `<div class="mvci-menu">
      <div class="mvci-head"><div><div class="mvci-title">Mission Vector</div><div class="mvci-sub">Collect the data Rebel Command needs</div></div><button class="mvci-close" id="mvci-launch-close" aria-label="Close">×</button></div>
      <input id="mvci-launch-date" class="mvci-date" type="date" value="${date}">
      <div class="mvci-grid">
        <button class="mvci-btn primary" id="mvci-launch-staffing">Collect schedule / staffing</button>
        <button class="mvci-btn primary" id="mvci-launch-overtime">Collect OT priority</button>
      </div>
      <div class="mvci-status"><span><span class="mvci-dot ${paired ? '' : 'off'}"></span>${paired ? 'Rebel Command connected' : 'Pairing needed'}</span><span>v${VERSION.replace('-dev','')}</span></div>
    </div>`;
  }

  function render(open = false) {
    ensureStyle();
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }
    root.dataset.open = open ? '1' : '0';
    const existingToast = root.querySelector('.mvci-toast')?.outerHTML || '';
    root.innerHTML = `${existingToast}${menuHtml(open)}<button class="mvci-launch" id="mvci-launch-toggle">MISSION VECTOR</button>`;
    root.querySelector('#mvci-launch-toggle')?.addEventListener('click', () => render(root.dataset.open !== '1'));
    root.querySelector('#mvci-launch-close')?.addEventListener('click', () => render(false));
    root.querySelector('#mvci-launch-staffing')?.addEventListener('click', () => {
      const date = clean(root.querySelector('#mvci-launch-date')?.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('Choose a valid date first.');
      goStaffing(date);
    });
    root.querySelector('#mvci-launch-overtime')?.addEventListener('click', () => {
      const date = clean(root.querySelector('#mvci-launch-date')?.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('Choose a valid date first.');
      goOvertime(date);
    });
  }

  function ensureRoot() {
    if (!document.getElementById(ROOT_ID)) render(false);
  }

  async function waitFor(test, timeout = 25000, interval = 250) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { const value = test(); if (value) return value; } catch (_) {}
      await wait(interval);
    }
    return null;
  }

  async function runPending() {
    const pending = loadJson(PENDING_KEY, {});
    if (!pending?.type || !/^\d{4}-\d{2}-\d{2}$/.test(clean(pending.date))) return;
    if (!Number.isFinite(Number(pending.requestedAt)) || Date.now() - Number(pending.requestedAt) > 2 * 60 * 1000) {
      removeKey(PENDING_KEY);
      return;
    }

    if (pending.type === 'staffing' && isListView()) {
      const pageDate = await waitFor(() => visibleDate() === pending.date && window.MVCI_VECTOR_BRIDGE_0200?.scrapeNow ? pending.date : '', 20000);
      if (!pageDate) return toast(`Opened ListView, but ${pending.date} was not ready to collect.`);
      removeKey(PENDING_KEY);
      toast(`Collecting schedule / staffing for ${pending.date}…`);
      try {
        await window.MVCI_VECTOR_BRIDGE_0200.scrapeNow();
        const s = window.MVCI_VECTOR_BRIDGE_0200.status?.() || {};
        if (s.status === 'sent-good') toast(`Schedule / staffing sent for ${pending.date}.`);
        else if (s.status === 'sent-partial') toast(`Schedule / staffing sent for ${pending.date}, but Rebel Command marked it for review.`);
        else toast(`Collection finished with status: ${s.status || 'unknown'}.`);
      } catch (error) {
        toast(`Schedule collection stopped safely: ${clean(error?.message || error)}`);
      }
      return;
    }

    if (pending.type === 'overtime' && isRankingPage()) {
      const ready = await waitFor(() => {
        const dateOk = visibleDate() === pending.date;
        const api = window.MVCI_OVERTIME_COLLECTOR;
        const legacy = document.getElementById('vector-overtime-collector-status');
        return dateOk && (api?.captureRanking || legacy) ? { api, legacy } : null;
      }, 25000);
      if (!ready) return toast(`Opened OT Rankings, but ${pending.date} was not ready to collect.`);
      removeKey(PENDING_KEY);
      toast(`Collecting OT priority for ${pending.date}…`);
      try {
        if (ready.api?.captureRanking) await ready.api.captureRanking({ force: true });
        else ready.legacy.click();
        setTimeout(() => toast(`OT priority collection started for ${pending.date}.`), 500);
      } catch (error) {
        toast(`OT priority collection stopped safely: ${clean(error?.message || error)}`);
      }
    }
  }

  ensureRoot();
  setTimeout(runPending, 900);
  setInterval(() => {
    ensureRoot();
    if (isRankingPage()) saveJson(RANKING_PATH_KEY, { path: location.pathname, at: Date.now() });
  }, 5000);

  window.MVCI_GLOBAL_LAUNCHER_0230 = { version: VERSION, goStaffing, goOvertime, runPending, status: () => ({ paired: pairingReady(), visibleDate: visibleDate() }) };
})();