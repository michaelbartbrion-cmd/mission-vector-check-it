// ==UserScript==
// @name         Mission Vector Check It - Vector Scheduling DEV
// @namespace    mission-vector-check-it-scheduling
// @version      1.0.2
// @description  Mission Vector Check It scheduling live loader. Loads the current approved read-only scheduler runtime on every Vector refresh.
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js
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

  const LOADER_VERSION = '1.0.2';
  const BASE = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/';
  const MANIFEST_URL = BASE + 'vector-scheduling-runtime-manifest.json';

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'Cache-Control': 'no-cache' },
        timeout: 20000,
        onload: r => {
          if (r.status >= 200 && r.status < 300) resolve(r.responseText);
          else reject(new Error(`HTTP ${r.status} loading ${url}`));
        },
        onerror: () => reject(new Error(`Network error loading ${url}`)),
        ontimeout: () => reject(new Error(`Timeout loading ${url}`))
      });
    });
  }

  function execute(code, sourceUrl) {
    (new Function(`${code}\n//# sourceURL=${sourceUrl}`))();
  }

  async function fetchManifest() {
    const text = await gmGet(`${MANIFEST_URL}?t=${Date.now()}`);
    const manifest = JSON.parse(text);
    if (!manifest || !Array.isArray(manifest.scripts) || !manifest.runtimeVersion) throw new Error('Runtime manifest is invalid.');
    return manifest;
  }

  function scriptUrl(entry, runtimeVersion) {
    const raw = typeof entry === 'string' ? entry : entry?.url || entry?.path;
    if (!raw) throw new Error('Runtime manifest contains an invalid script entry.');
    const url = /^https?:\/\//i.test(raw) ? raw : BASE + raw;
    return `${url}${url.includes('?') ? '&' : '?'}runtime=${encodeURIComponent(runtimeVersion)}&t=${Date.now()}`;
  }

  async function boot() {
    const manifest = await fetchManifest();
    window.__mvciLiveLoader = {
      loaderVersion: LOADER_VERSION,
      runtimeVersion: manifest.runtimeVersion,
      loadedAt: new Date().toISOString(),
      manifestUrl: MANIFEST_URL
    };

    for (const entry of manifest.scripts) {
      const url = scriptUrl(entry, manifest.runtimeVersion);
      const code = await gmGet(url);
      execute(code, url);
    }
    wireUpdateButton();
  }

  async function checkUpdateAndReload() {
    try {
      const manifest = await fetchManifest();
      const current = window.__mvciLiveLoader?.runtimeVersion || 'unknown';
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
    if (!button || button.dataset.mvciLoader102 === '1') return;
    button.dataset.mvciLoader102 = '1';
    button.title = 'Check the live scheduler manifest and reload the newest build';
    button.onclick = checkUpdateAndReload;
  }

  window.MVCI_SCHEDULER_CHECK_UPDATE = checkUpdateAndReload;
  const observer = new MutationObserver(() => setTimeout(wireUpdateButton, 0));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  boot().catch(err => {
    console.error('Vector Scheduling live loader failed:', err);
    alert(`Vector Scheduling live loader failed.\n\n${err.message || err}\n\nNo Vector data was changed.`);
  });
})();
