(function () {
  'use strict';

  const VERSION = '0.26.1-dev';
  const ROOT_ID = 'mvci-control-panel-v0250';
  const STYLE_ID = 'mvci-rebel-icon-style-v0261';
  const CACHE_KEY = 'mvciVectorRebelIconData_v1';
  const REBEL_SOURCE = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js';

  if (window.top !== window.self || window.MVCI_REBEL_ICON_0261) return;

  let iconData = '';
  let applying = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .orb {
        width:54px !important;
        height:54px !important;
        padding:0 !important;
        margin-left:auto !important;
        border:2px solid #1b5a7a !important;
        border-radius:50% !important;
        background:#fff !important;
        color:#153e5c !important;
        box-shadow:0 5px 18px rgba(13,50,72,.28) !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        cursor:pointer !important;
        overflow:hidden !important;
      }
      #${ROOT_ID} .orb:after { display:none !important; content:none !important; }
      #${ROOT_ID} .orb img[data-mvci-rebel-icon="1"] {
        display:block;
        width:39px;
        height:39px;
        object-fit:contain;
        pointer-events:none;
        user-select:none;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function applyIcon() {
    if (applying || !iconData) return;
    const root = document.getElementById(ROOT_ID);
    const orb = root?.querySelector('#mvci-orb');
    if (!orb) return;
    if (orb.querySelector('img[data-mvci-rebel-icon="1"]')?.src === iconData) return;

    applying = true;
    try {
      orb.textContent = '';
      const img = document.createElement('img');
      img.setAttribute('data-mvci-rebel-icon', '1');
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.draggable = false;
      img.width = 39;
      img.height = 39;
      img.src = iconData;
      orb.appendChild(img);
      orb.title = 'Mission Vector';
      orb.setAttribute('aria-label', 'Open Mission Vector controls');
    } finally {
      applying = false;
    }
  }

  function cachedIcon() {
    try {
      const value = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(CACHE_KEY) || '';
      return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';
    } catch (_) {
      return '';
    }
  }

  function cacheIcon(value) {
    try { sessionStorage.setItem(CACHE_KEY, value); } catch (_) {}
    try { localStorage.setItem(CACHE_KEY, value); } catch (_) {}
  }

  async function loadExactVectorRebelIcon() {
    const cached = cachedIcon();
    if (cached) return cached;

    const response = await fetch(`${REBEL_SOURCE}?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} reading Vector Rebel icon source`);
    const source = await response.text();
    const match = source.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/);
    if (!match) throw new Error('Vector Rebel icon data was not found in the current PPE helper.');
    cacheIcon(match[0]);
    return match[0];
  }

  ensureStyle();

  const observer = new MutationObserver(() => applyIcon());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  loadExactVectorRebelIcon()
    .then(value => {
      iconData = value;
      applyIcon();
    })
    .catch(error => console.warn('Mission Vector: could not mirror the Vector Rebel launcher icon.', error));

  window.MVCI_REBEL_ICON_0261 = {
    version: VERSION,
    apply: applyIcon,
    status: () => ({ loaded: !!iconData, source: REBEL_SOURCE })
  };
})();
