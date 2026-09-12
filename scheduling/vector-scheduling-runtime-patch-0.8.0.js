(function () {
  'use strict';

  const PATCH_VERSION = '0.8.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  if (window.__mvciVectorSchedulingPatch080) return;
  window.__mvciVectorSchedulingPatch080 = { version: PATCH_VERSION, startedAt: Date.now() };

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function saveState(state) {
    if (!state) return;
    state.metadata = state.metadata || {};
    state.metadata.runtimeVersion = PATCH_VERSION;
    state.metadata.runtimeLoadedAt = new Date().toISOString();
    state.metadata.updatedAt = new Date().toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function stampRuntime() {
    const state = loadState();
    if (!state) return;
    if (state.metadata?.runtimeVersion === PATCH_VERSION) return;
    saveState(state);
  }

  function renderBuildStatus() {
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;

    let box = panel.querySelector('#vs-build-status-v080');
    if (box) box.remove();

    const state = loadState();
    if (!state) return;

    const meta = state.metadata || {};
    const lastCaptureVersion = meta.lastCaptureVersion || null;
    const stale = !lastCaptureVersion || !/^0\.(7|8)\./.test(lastCaptureVersion);

    box = document.createElement('div');
    box.id = 'vs-build-status-v080';
    box.className = 'vs-card';
    box.style.border = stale ? '2px solid #c98b00' : '1px solid #d7dce2';
    box.innerHTML = `
      <h3>Build status <span class="vs-muted">${esc(PATCH_VERSION)}</span></h3>
      <div><b>Running:</b> ${esc(PATCH_VERSION)}</div>
      <div><b>Last capture reader:</b> ${esc(lastCaptureVersion || 'older/unknown')}</div>
      ${stale ? '<div style="margin-top:6px;font-weight:700;color:#8a5a00">Recapture the displayed date before exporting. The saved observations are from the older reader.</div>' : ''}
    `;

    const readCard = [...panel.querySelectorAll('.vs-card')].find(x => /Read current Vector page/i.test(x.textContent || ''));
    if (readCard) readCard.insertAdjacentElement('beforebegin', box);
    else panel.prepend(box);
  }

  function wire() {
    stampRuntime();
    renderBuildStatus();
  }

  const observer = new MutationObserver(() => setTimeout(wire, 0));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  wire();
})();
