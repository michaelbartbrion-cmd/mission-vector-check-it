// ==UserScript==
// @name         Mission Vector Check It - Vector Scheduling LIVE Loader
// @namespace    mission-vector-check-it-scheduling-loader
// @version      1.0.1
// @description  One-time Tampermonkey loader that always pulls the newest approved Vector Scheduling development runtime manifest.
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

  const LOADER_VERSION = '1.0.1';
  const BASE = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/';
  const MANIFEST_URL = BASE + 'vector-scheduling-runtime-manifest.json';

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'Cache-Control': 'no-cache' },
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

  async function fetchManifest() {
    const text = await gmGet(`${MANIFEST_URL}?t=${Date.now()}`);
    const manifest = JSON.parse(text);
    if (!manifest || !Array.isArray(manifest.scripts) || !manifest.runtimeVersion) {
      throw new Error('Runtime manifest is invalid.');
    }
    return manifest;
  }

  async function boot() {
    const manifest = await fetchManifest();
    window.__mvciLiveLoader = {
      loaderVersion: LOADER_VERSION,
      runtimeVersion: manifest.runtimeVersion,
      loadedAt: new Date().toISOString(),
      manifestUrl: MANIFEST_URL
    };

    for (const path of manifest.scripts) {
      const url = `${BASE}${path}?runtime=${encodeURIComponent(manifest.runtimeVersion)}&t=${Date.now()}`;
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
    alert(`Vector Scheduling LIVE Loader failed.\n\n${err.message || err}\n\nThe loader did not make any changes to Vector.`);
  });
})();
