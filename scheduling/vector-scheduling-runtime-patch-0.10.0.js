(function () {
  'use strict';

  const PATCH_VERSION = '0.10.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  if (window.__mvciVectorSchedulingPatch0100) return;
  window.__mvciVectorSchedulingPatch0100 = { version: PATCH_VERSION, startedAt: Date.now() };

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function saveState(state) {
    if (!state) return;
    state.metadata = state.metadata || {};
    state.metadata.runtimeVersion = PATCH_VERSION;
    state.metadata.liveLoader = true;
    state.metadata.liveLoaderVersion = window.__mvciLiveLoader?.loaderVersion || null;
    state.metadata.runtimeLoadedAt = new Date().toISOString();
    state.metadata.updatedAt = new Date().toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function latestBackfill(state) {
    const runs = Array.isArray(state?.backfillRuns) ? state.backfillRuns : [];
    return runs.length ? runs[runs.length - 1] : null;
  }

  function renderStatus() {
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;

    const old = panel.querySelector('#vs-live-build-status-v0100');
    if (old) old.remove();

    const state = loadState();
    if (!state) return;
    saveState(state);

    const backfill = latestBackfill(state);
    const loaderVersion = window.__mvciLiveLoader?.loaderVersion || 'unknown';
    const runtimeVersion = window.__mvciLiveLoader?.runtimeVersion || PATCH_VERSION;

    const card = document.createElement('div');
    card.id = 'vs-live-build-status-v0100';
    card.className = 'vs-card';
    card.style.border = '2px solid #1b6ca8';
    card.innerHTML = `
      <h3>Live build status</h3>
      <div><b>Runtime:</b> ${esc(runtimeVersion)}</div>
      <div><b>Live loader:</b> ${esc(loaderVersion)}</div>
      <div><b>Last capture reader:</b> ${esc(state.metadata?.lastCaptureVersion || 'older/unknown')}</div>
      <div><b>Backfill:</b> ${backfill ? esc(`${backfill.status || 'unknown'} · ${backfill.captures || 0} dates${backfill.lastCapturedDate ? ` · through ${backfill.lastCapturedDate}` : ''}`) : 'not started'}</div>
      <div class="vs-muted" style="margin-top:6px">This loader checks the GitHub runtime manifest on every page refresh, so future scheduler code updates no longer require replacing the Tampermonkey script.</div>
    `;

    const first = panel.querySelector('.vs-card');
    if (first) first.insertAdjacentElement('beforebegin', card);
    else panel.prepend(card);
  }

  function wireUpdate() {
    const button = document.getElementById('vs-update');
    if (!button || !window.MVCI_SCHEDULER_CHECK_UPDATE) return;
    button.title = 'Check the live runtime manifest and reload the newest scheduler build';
    button.onclick = () => window.MVCI_SCHEDULER_CHECK_UPDATE();
  }

  function wire() {
    renderStatus();
    wireUpdate();
  }

  const observer = new MutationObserver(() => setTimeout(wire, 0));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  wire();
})();
