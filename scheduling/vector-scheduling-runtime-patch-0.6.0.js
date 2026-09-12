(function () {
  'use strict';

  const PATCH_VERSION = '0.6.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  if (window.__mvciVectorSchedulingPatch060) return;
  window.__mvciVectorSchedulingPatch060 = { version: PATCH_VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).trim();

  function parseDate(value) {
    const m = clean(value).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function fmt(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function addDays(value, days) {
    const d = parseDate(value);
    if (!d) return null;
    d.setDate(d.getDate() + days);
    return fmt(d);
  }
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function saveState(state) {
    if (!state) return;
    state.metadata = state.metadata || {};
    state.metadata.updatedAt = new Date().toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }
  function ensureRatioPeriods(state) {
    if (!state) return null;
    state.settings = state.settings || {};
    if (!Array.isArray(state.ratioPeriods)) state.ratioPeriods = [];

    if (!state.settings.ratioStartDate) {
      const active = state.ratioPeriods.find(p => !p.endDate);
      if (active?.startDate) state.settings.ratioStartDate = active.startDate;
      else if (state.settings.balanceStartDate) {
        // The legacy engine treats balanceStartDate as an exclusive boundary.
        const inferred = addDays(state.settings.balanceStartDate, 1);
        if (inferred) {
          state.settings.ratioStartDate = inferred;
          state.ratioPeriods.push({
            startDate: inferred,
            endDate: null,
            createdAt: new Date().toISOString(),
            source: 'inferred-from-legacy-exclusive-boundary',
            note: 'Imported from the legacy spreadsheet balance window.'
          });
        }
      }
    }
    return state;
  }
  function currentPeriod(state) {
    ensureRatioPeriods(state);
    return [...(state.ratioPeriods || [])].reverse().find(p => !p.endDate) || null;
  }
  function coverage(state, startDate) {
    const rows = (state.history || []).filter(r => !startDate || String(r.date || '') >= startDate);
    const dates = [...new Set(rows.map(r => r.date).filter(Boolean))].sort();
    return {
      rows: rows.length,
      dates: dates.length,
      first: dates[0] || null,
      last: dates[dates.length-1] || null
    };
  }

  function startNewRatioPeriod(startDate) {
    const state = ensureRatioPeriods(loadState());
    if (!state) throw new Error('Scheduling state has not been initialized yet.');
    if (!parseDate(startDate)) throw new Error('Choose a valid ratio start date.');

    const active = currentPeriod(state);
    if (active?.startDate === startDate) return false;

    if (active && !active.endDate) active.endDate = addDays(startDate, -1);
    state.ratioPeriods.push({
      startDate,
      endDate: null,
      createdAt: new Date().toISOString(),
      source: 'manual-ratio-reset',
      note: 'New active Truck 504 rotation ratio period. Prior history retained for audit/history.'
    });

    // Engine compatibility: historyInWindow uses an exclusive lower bound.
    state.settings.ratioStartDate = startDate;
    state.settings.balanceStartDate = addDays(startDate, -1);
    state.settings.balanceEndDate = null;
    state.metadata = state.metadata || {};
    state.metadata.lastRatioResetAt = new Date().toISOString();
    saveState(state);
    return true;
  }

  function injectRatioCard() {
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;
    if (panel.querySelector('#vs-ratio-period-card')) return;

    const state = ensureRatioPeriods(loadState());
    if (!state) return;
    saveState(state);
    const active = currentPeriod(state);
    const start = active?.startDate || state.settings?.ratioStartDate || '';
    const c = coverage(state, start || null);
    const archived = (state.ratioPeriods || []).filter(p => p.endDate).slice().reverse();

    const card = document.createElement('div');
    card.id = 'vs-ratio-period-card';
    card.className = 'vs-card';
    card.innerHTML = `
      <h3>Ratio period</h3>
      <div style="margin-bottom:6px"><strong>Active ratio start:</strong> ${start || 'not set'}</div>
      <div class="vs-muted" style="margin-bottom:8px">Confirmed so far in this period: ${c.rows} credited records across ${c.dates} dates${c.first ? ` (${c.first} through ${c.last})` : ''}.</div>
      <div class="vs-grid">
        <div><label>First day that counts in new ratio</label><input id="vs-ratio-start" class="vs-input" type="date" value="${start || ''}"></div>
        <div style="display:flex;align-items:end"><button id="vs-ratio-reset" class="vs-btn" style="width:100%">Start new ratio period</button></div>
      </div>
      <div class="vs-muted" style="margin-top:7px">This does not delete old history. It closes the previous ratio era and makes the selected date the first day counted for future balancing.</div>
      ${archived.length ? `<details style="margin-top:8px"><summary>Previous ratio periods (${archived.length})</summary><div class="vs-muted" style="margin-top:5px">${archived.map(p => `${p.startDate} through ${p.endDate}`).join('<br>')}</div></details>` : ''}
    `;

    const cards = panel.querySelectorAll('.vs-card');
    if (cards.length) cards[0].insertAdjacentElement('afterend', card);
    else panel.appendChild(card);

    const button = card.querySelector('#vs-ratio-reset');
    button.onclick = () => {
      const input = card.querySelector('#vs-ratio-start');
      const chosen = input?.value;
      if (!chosen) return alert('Choose the first day that should count in the new ratio.');
      const ok = confirm(`Start a NEW Truck 504 ratio period on ${chosen}?\n\nOld history will be kept, but future balancing will count only this date forward.`);
      if (!ok) return;
      try {
        const changed = startNewRatioPeriod(chosen);
        alert(changed ? `New ratio period starts ${chosen}. Reloading the scheduling assistant.` : 'That date is already the active ratio start.');
        if (changed) location.reload();
      } catch (err) {
        alert(`Ratio reset failed: ${err.message || err}`);
      }
    };
  }

  const observer = new MutationObserver(() => setTimeout(injectRatioCard, 0));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  injectRatioCard();
})();