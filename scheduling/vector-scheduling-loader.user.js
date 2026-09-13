// ==UserScript==
// @name         Mission Vector Check It - Vector Scheduling LIVE Loader
// @namespace    mission-vector-check-it-scheduling-loader
// @version      1.0.3
// @description  Tampermonkey loader that pulls the newest Vector Scheduling development runtime and keeps loading independent modules if one fails.
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-loader.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-loader.user.js
// @match        https://crewsense.com/*
// @match        https://*.crewsense.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const LOADER_VERSION = '1.0.3';
  const BASE = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/';
  const MANIFEST_URL = BASE + 'vector-scheduling-runtime-manifest.json';
  const STATUS_ID = 'mvci-live-loader-status-v103';

  function publish(meta) {
    try {
      window.__mvciLiveLoader = meta;
      document.documentElement.dataset.mvciLoaderVersion = meta.loaderVersion || '';
      document.documentElement.dataset.mvciRuntimeVersion = meta.runtimeVersion || '';
      document.documentElement.dataset.mvciLoaderFailures = String((meta.failures || []).length);
      document.documentElement.dataset.mvciLoaderLoaded = String((meta.loadedScripts || []).length);
    } catch (_) {}
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'Cache-Control': 'no-cache, no-store, max-age=0' },
        onload: r => {
          if (r.status >= 200 && r.status < 300) resolve(r.responseText);
          else reject(new Error(`HTTP ${r.status} loading ${url}`));
        },
        onerror: () => reject(new Error(`Network error loading ${url}`)),
        ontimeout: () => reject(new Error(`Timeout loading ${url}`)),
        timeout: 20000
      });
    });
  }

  function execute(code, sourceUrl) {
    const wrapped = `${code}\n//# sourceURL=${sourceUrl}`;
    (new Function(wrapped))();
  }

  function resolveScriptUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return BASE + String(path || '').replace(/^\/+/, '');
  }

  async function fetchManifest() {
    const text = await gmGet(`${MANIFEST_URL}?t=${Date.now()}`);
    const manifest = JSON.parse(text);
    if (!manifest || !Array.isArray(manifest.scripts) || !manifest.runtimeVersion) {
      throw new Error('Runtime manifest is invalid.');
    }
    return manifest;
  }

  function renderStatus(meta) {
    let el = document.getElementById(STATUS_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = STATUS_ID;
      el.style.cssText = [
        'position:fixed','right:8px','top:8px','z-index:2147483647',
        'background:#111827','color:#e5e7eb','border:1px solid #374151',
        'border-radius:6px','padding:5px 8px','font:11px/1.25 system-ui,sans-serif',
        'box-shadow:0 2px 10px rgba(0,0,0,.25)','pointer-events:none','opacity:.9'
      ].join(';');
      document.documentElement.appendChild(el);
    }
    const failures = meta.failures || [];
    el.textContent = `MVCI loader ${meta.loaderVersion} · runtime ${meta.runtimeVersion || 'loading'} · ${meta.loadedScripts?.length || 0} loaded${failures.length ? ` · ${failures.length} failed` : ''}`;
    el.style.borderColor = failures.length ? '#b45309' : '#374151';
    if (meta.complete) setTimeout(() => { try { el.remove(); } catch (_) {} }, failures.length ? 15000 : 5000);
  }

  async function boot() {
    const manifest = await fetchManifest();
    const meta = {
      loaderVersion: LOADER_VERSION,
      runtimeVersion: manifest.runtimeVersion,
      loadedAt: new Date().toISOString(),
      manifestUrl: MANIFEST_URL,
      loadedScripts: [],
      failures: [],
      complete: false
    };
    publish(meta);
    renderStatus(meta);

    if (manifest.loaderMinVersion && manifest.loaderMinVersion !== LOADER_VERSION) {
      console.warn(`Vector Scheduling: manifest requests loader ${manifest.loaderMinVersion}; running ${LOADER_VERSION}.`);
    }

    for (const path of manifest.scripts) {
      const baseUrl = resolveScriptUrl(path);
      const sep = baseUrl.includes('?') ? '&' : '?';
      const url = `${baseUrl}${sep}runtime=${encodeURIComponent(manifest.runtimeVersion)}&t=${Date.now()}`;
      try {
        const code = await gmGet(url);
        execute(code, baseUrl);
        meta.loadedScripts.push(String(path));
      } catch (err) {
        const failure = { path: String(path), error: String(err?.message || err) };
        meta.failures.push(failure);
        console.error('Vector Scheduling module failed:', failure.path, err);
      }
      publish(meta);
      renderStatus(meta);
    }

    meta.complete = true;
    meta.completedAt = new Date().toISOString();
    publish(meta);
    renderStatus(meta);
    wireUpdateButton();

    if (meta.failures.length) {
      console.warn('Vector Scheduling loaded with module failures:', meta.failures);
    }
  }

  async function checkUpdateAndReload() {
    try {
      const manifest = await fetchManifest();
      const current = window.__mvciLiveLoader?.runtimeVersion || document.documentElement.dataset.mvciRuntimeVersion || 'unknown';
      const next = manifest.runtimeVersion;
      const msg = current === next
        ? `Scheduler runtime ${next} is current. Reload it now?`
        : `New scheduler runtime available: ${current} → ${next}. Reload now?`;
      if (confirm(msg)) location.reload();
    } catch (err) {
      alert(`Vector Scheduling update check failed.\n\n${err.message || err}`);
    }
  }

  function wireUpdateButton() {
    const button = document.getElementById('vs-update');
    if (!button) return;
    button.dataset.mvciLiveLoaderWired = '1';
    button.title = 'Check the live runtime manifest and reload the newest scheduler build';
    button.onclick = checkUpdateAndReload;
  }

  window.MVCI_SCHEDULER_CHECK_UPDATE = checkUpdateAndReload;

  const observer = new MutationObserver(() => setTimeout(wireUpdateButton, 0));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  boot().catch(err => {
    console.error('Vector Scheduling LIVE Loader failed:', err);
    const meta = {
      loaderVersion: LOADER_VERSION,
      runtimeVersion: 'boot-error',
      loadedAt: new Date().toISOString(),
      manifestUrl: MANIFEST_URL,
      loadedScripts: [],
      failures: [{ path: 'loader', error: String(err?.message || err) }],
      complete: true
    };
    publish(meta);
    renderStatus(meta);
    alert(`Vector Scheduling LIVE Loader failed.\n\n${err.message || err}\n\nThe loader did not make any changes to Vector.`);
  });
})();
