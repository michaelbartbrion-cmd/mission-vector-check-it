// ==UserScript==
// @name         Mission Vector Check It - Vector Scheduling LIVE Loader
// @namespace    mission-vector-check-it-scheduling-loader
// @version      1.0.5.2
// @description  Quiet Tampermonkey loader for the current Mission Vector CrewSense runtime.
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

  // Keep the manifest protocol identity pinned to 1.0.5; userscript patch version is 1.0.5.2.
  const LOADER_VERSION = '1.0.5';
  const BASE = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/';
  // Version the manifest path itself so a stale branch-path response cannot strand the browser on an older runtime.
  const MANIFEST_URL = BASE + 'vector-scheduling-runtime-manifest-0.30.3.json';

  try { document.getElementById('mvci-live-loader-status-v103')?.remove(); } catch (_) {}

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
        headers: { 'Cache-Control': 'no-cache, no-store, max-age=0', 'Pragma': 'no-cache' },
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
    (new Function(`${code}\n//# sourceURL=${sourceUrl}`))();
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
    if (manifest.runtimeVersion !== '0.30.3-dev') {
      throw new Error(`Pinned manifest returned unexpected runtime ${manifest.runtimeVersion}.`);
    }
    return manifest;
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

    if (manifest.loaderMinVersion && manifest.loaderMinVersion !== LOADER_VERSION) {
      console.warn(`Mission Vector: manifest requests loader ${manifest.loaderMinVersion}; running ${LOADER_VERSION}.`);
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
        console.error('Mission Vector module failed:', failure.path, err);
      }
      publish(meta);
    }

    meta.complete = true;
    meta.completedAt = new Date().toISOString();
    publish(meta);
    if (meta.failures.length) console.warn('Mission Vector loaded with module failures:', meta.failures);
  }

  async function checkUpdateAndReload() {
    try {
      const manifest = await fetchManifest();
      const current = window.__mvciLiveLoader?.runtimeVersion || document.documentElement.dataset.mvciRuntimeVersion || 'unknown';
      const next = manifest.runtimeVersion;
      const msg = current === next
        ? `Mission Vector runtime ${next} is current. Reload it now?`
        : `New Mission Vector runtime available: ${current} → ${next}. Reload now?`;
      if (confirm(msg)) location.reload();
    } catch (err) {
      alert(`Mission Vector update check failed.\n\n${err.message || err}`);
    }
  }

  window.MVCI_SCHEDULER_CHECK_UPDATE = checkUpdateAndReload;

  // INCIDENT RECOVERY HOLD: disabled by default even if Tampermonkey is re-enabled.
  // An offline test pass is not permission to resume 28 scripts inside CrewSense.
  // Only remove this gate after an explicit, limited human-approved browser test.
  const STABILITY_HOLD = true;
  // Visible safe shell is intentionally inert: zero modules, zero fetches, zero page observers.
  function showRecoveryPanel() {
    if (!document.body || !document.createElement || document.getElementById('mvci-scout-recovery')) return;
    const panel = document.createElement('section');
    panel.id = 'mvci-scout-recovery';
    panel.setAttribute('aria-label','Rebel Scout recovery status');
    panel.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483640;width:265px;max-width:calc(100vw - 28px);background:#14241b;color:#f0f5ec;border:1px solid #55715a;border-radius:12px;box-shadow:0 12px 38px #0006;padding:13px 14px;font:12px/1.5 system-ui,sans-serif';
    const row = document.createElement('div');row.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px';
    const heading=document.createElement('strong');heading.textContent='REBEL SCOUT';heading.style.cssText='font-size:15px;letter-spacing:.025em';
    const close=document.createElement('button');close.type='button';close.textContent='Ã—';close.setAttribute('aria-label','Dismiss Scout recovery status');close.style.cssText='border:1px solid #546a59;border-radius:6px;background:#233c2b;color:white;width:26px;height:26px;cursor:pointer';close.addEventListener('click',()=>panel.remove());
    const brand=document.createElement('div');brand.style.cssText='display:flex;align-items:center;gap:8px';
    const emblem=document.createElement('img');emblem.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAABZElEQVR42u2aMQ7CMAxFs3KATky9CDviCvQajCxcgRN0ZmfuFbJ2YWJh6MZqhFQkhJLUTu0kRh08VIrj/6iTOjGm2uyNZpMOAKOpBIAfUwXQOwBAC8DDI14EgurQRaRODMCFG+BGCL4LiLfIOQZsPKmdhCN9UD7YSY7IcY/x2QYAtgSgyXEh5zMykC9NXOJr4luZHIdxbiNSxSc0JrWC46LJiTvPnDVBBohdeBLi33YP+XGXANziXfM2IQCOr+aU+IazrsoBYKQAWkUA4ALgLLx84jvtACY1wLpgAPsNkCJnJdbUAqACABiDHri3ZEoJkPo7ANwAkBBgkAKABMUcSQtnKZxljo/jasahJKcZjlNVLqu1A5i/A9AEcdUOQDrULwBS4rEXWwuAlHjs3WgpdppzvV7kr09tcBQnntJiKlI8tclXnPiYLmWfstKU7BNLCX+mbnRzCbdVAZ16qRZT1n+riNsL8DKPqVHo2CcAAAAASUVORK5CYII=';emblem.alt='';emblem.width=30;emblem.height=30;emblem.style.cssText='width:30px;height:30px;border:1px solid #6f8d70;border-radius:7px;background:#263f31;object-fit:contain';
    brand.append(emblem,heading);row.append(brand,close);panel.appendChild(row);
    const status=document.createElement('div');status.textContent='PAUSED Â· STABILITY HOLD';status.style.cssText='margin-top:7px;font-weight:800;color:#f1cf8c';panel.appendChild(status);
    const detail=document.createElement('div');detail.textContent='0 modules loaded. No sync or assignment controls active.';detail.style.cssText='margin-top:4px;color:#bbd1bf;font-size:11px';panel.appendChild(detail);
    document.body.appendChild(panel);
  }
  if (STABILITY_HOLD) {
    publish({
      loaderVersion: LOADER_VERSION,
      runtimeVersion: 'stability-hold',
      loadedAt: new Date().toISOString(),
      manifestUrl: MANIFEST_URL,
      loadedScripts: [],
      failures: [],
      complete: false,
      disabled: true,
      reason: 'Rebel Scout stability incident; no CrewSense modules loaded'
    });
    console.warn('Rebel Scout is in stability hold. No CrewSense modules loaded; leave the userscript disabled pending approval.');
    showRecoveryPanel();
    return;
  }

  boot().catch(err => {
    console.error('Mission Vector LIVE Loader failed:', err);
    publish({
      loaderVersion: LOADER_VERSION,
      runtimeVersion: 'boot-error',
      loadedAt: new Date().toISOString(),
      manifestUrl: MANIFEST_URL,
      loadedScripts: [],
      failures: [{ path: 'loader', error: String(err?.message || err) }],
      complete: true
    });
    alert(`Mission Vector loader failed.\n\n${err.message || err}\n\nNo Vector changes were made.`);
  });
})();
