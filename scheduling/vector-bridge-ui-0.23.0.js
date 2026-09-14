(function () {
  'use strict';

  const VERSION = '0.23.0-dev';
  const CARD_ID = 'vs-vector-bridge-v0200';
  const STYLE_ID = 'mvci-vector-bridge-friendly-style-v0230';

  if (window.top !== window.self || window.__mvciBridgeFriendlyUi0230) return;
  window.__mvciBridgeFriendlyUi0230 = { version: VERSION, startedAt: Date.now() };

  const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${CARD_ID}{padding:12px!important;border-radius:10px!important}
      #${CARD_ID} .mvci-friendly-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      #${CARD_ID} .mvci-friendly-title{font-size:14px;font-weight:800;color:#f8fafc}
      #${CARD_ID} .mvci-friendly-sub{font-size:11px;opacity:.7;margin-top:2px}
      #${CARD_ID} .mvci-friendly-status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:800;white-space:nowrap;border:1px solid rgba(255,255,255,.12)}
      #${CARD_ID} .mvci-friendly-status.good{background:rgba(16,185,129,.15);color:#a7f3d0}
      #${CARD_ID} .mvci-friendly-status.warn{background:rgba(245,158,11,.14);color:#fde68a}
      #${CARD_ID} .mvci-friendly-status.bad{background:rgba(239,68,68,.14);color:#fecaca}
      #${CARD_ID} .mvci-friendly-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}
      #${CARD_ID} .mvci-friendly-box{border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:rgba(0,0,0,.12)}
      #${CARD_ID} .mvci-friendly-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;opacity:.58}
      #${CARD_ID} .mvci-friendly-value{font-size:12px;font-weight:800;margin-top:3px;color:#f8fafc}
      #${CARD_ID} .mvci-friendly-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}
      #${CARD_ID} .mvci-friendly-note{font-size:10px;opacity:.66;margin-top:8px;line-height:1.35}
      #${CARD_ID} .mvci-friendly-error{margin-top:8px;padding:7px 8px;border-radius:7px;background:rgba(239,68,68,.11);border:1px solid rgba(239,68,68,.22);font-size:10px;color:#fecaca;line-height:1.35}
    `;
    document.documentElement.appendChild(style);
  }

  function statusInfo(s) {
    if (!s?.paired) return { text: 'Pairing needed', cls: 'warn' };
    if (s.status === 'reading') return { text: 'Collecting…', cls: 'warn' };
    if (s.status === 'sent-good') return { text: 'Data ready', cls: 'good' };
    if (s.status === 'sent-partial') return { text: 'Needs review', cls: 'warn' };
    if (s.status === 'error') return { text: 'Needs attention', cls: 'bad' };
    return { text: 'Connected', cls: 'good' };
  }

  function snapshot() {
    const bridge = window.MVCI_VECTOR_BRIDGE_0200;
    const s = bridge?.status?.() || {};
    const cap = s.lastCapture || null;
    return JSON.stringify({ paired: !!s.paired, status: s.status || '', error: s.lastError || '', cap });
  }

  function apply() {
    ensureStyle();
    const bridge = window.MVCI_VECTOR_BRIDGE_0200;
    const card = document.getElementById(CARD_ID);
    if (!bridge || !card) return;

    const snap = snapshot();
    if (card.dataset.mvciFriendlySnapshot === snap && card.querySelector('#mvci-friendly-collect')) return;

    const s = bridge.status?.() || {};
    const cap = s.lastCapture || null;
    const info = statusInfo(s);
    const date = cap?.date || clean(window.MVCI_VECTOR_READER_0120?.visibleDisplayedDate?.() || window.MVCI_VECTOR_READER_0120?.displayedDate?.()) || 'Current page';
    const census = cap ? `${cap.rows ?? '—'} rows · ${cap.regular ?? '—'} countable` : 'Not collected yet';
    const quality = cap ? `${cap.groups ?? '—'} groups · ${cap.quality || 'unknown'}` : 'Waiting for first collection';

    card.dataset.mvciFriendlySnapshot = snap;
    card.innerHTML = `
      <div class="mvci-friendly-head">
        <div><div class="mvci-friendly-title">Mission Vector data</div><div class="mvci-friendly-sub">Schedule, staffing and action checks</div></div>
        <span class="mvci-friendly-status ${info.cls}">${esc(info.text)}</span>
      </div>
      <div class="mvci-friendly-grid">
        <div class="mvci-friendly-box"><div class="mvci-friendly-label">Displayed date</div><div class="mvci-friendly-value">${esc(date)}</div></div>
        <div class="mvci-friendly-box"><div class="mvci-friendly-label">Last collection</div><div class="mvci-friendly-value">${esc(census)}</div></div>
        <div class="mvci-friendly-box"><div class="mvci-friendly-label">Data quality</div><div class="mvci-friendly-value">${esc(quality)}</div></div>
        <div class="mvci-friendly-box"><div class="mvci-friendly-label">Write safety</div><div class="mvci-friendly-value">Automated writes OFF</div></div>
      </div>
      <div class="mvci-friendly-actions">
        <button id="mvci-friendly-pair" class="vs-btn secondary">${s.paired ? 'CHECK CONNECTION' : 'PAIR REBEL COMMAND'}</button>
        <button id="mvci-friendly-collect" class="vs-btn">${s.status === 'reading' ? 'COLLECTING…' : 'COLLECT THIS DATE'}</button>
      </div>
      <button class="vs-btn secondary" style="margin-top:7px" disabled>PREVIEW SCHEDULE · 0</button>
      <button class="vs-btn secondary" style="margin-top:6px" disabled>PREVIEW OT SIGNUPS · 0</button>
      <div class="mvci-friendly-note">Use the Mission Vector launcher from anywhere in CrewSense to jump to the correct screen and collect data. This panel never writes to Vector automatically.</div>
      ${s.lastError ? `<div class="mvci-friendly-error"><b>Last collection issue:</b> ${esc(s.lastError)}</div>` : ''}
    `;

    card.querySelector('#mvci-friendly-pair')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      bridge.configure?.();
    });
    card.querySelector('#mvci-friendly-collect')?.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'COLLECTING…';
      try { await bridge.scrapeNow?.(); }
      finally { setTimeout(apply, 50); }
    });
  }

  const observer = new MutationObserver(() => setTimeout(apply, 0));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(apply, 1700);
  setTimeout(apply, 500);
})();