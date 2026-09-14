(function () {
  'use strict';

  const VERSION = '0.23.0-dev';
  const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const PAIR_KEY = 'vectorStaffingCollectorPairing_v1';

  if (window.top !== window.self || window.__mvciVectorActionPreview0230) return;
  window.__mvciVectorActionPreview0230 = { version: VERSION, startedAt: Date.now() };

  const state = { packages: [], running: false, lastError: '', lastRefreshAt: null };
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  function loadJson(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function pairing() {
    const p = loadJson(PAIR_KEY, {});
    return { deviceId: clean(p.deviceId), token: clean(p.token), endpoint: clean(p.endpoint) || ENDPOINT };
  }
  function paired() { const p = pairing(); return !!(p.deviceId && p.token); }
  function displayedDate() {
    const reader = window.MVCI_VECTOR_READER_0120;
    return clean(reader?.visibleDisplayedDate?.() || reader?.displayedDate?.());
  }

  async function request(path, options = {}) {
    const p = pairing();
    if (!p.deviceId || !p.token) throw new Error('Mission Vector Bridge is not paired.');
    const response = await fetch(`${p.endpoint || ENDPOINT}${path}`, {
      method: options.method || 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${p.token}`,
        'X-Rebel-Device-ID': p.deviceId,
        ...(options.body ? {'Content-Type':'application/json'} : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) throw new Error(clean(body?.error || `Rebel Command request failed (${response.status})`));
    return body;
  }

  async function refreshWorklist() {
    if (!paired() || state.running) return;
    try {
      const body = await request('?action=action-worklist');
      state.packages = Array.isArray(body?.packages) ? body.packages : [];
      state.lastRefreshAt = new Date().toISOString();
      state.lastError = '';
    } catch (error) {
      state.lastError = clean(error?.message || error);
    }
    patchButtons();
  }

  async function freshGoodCensus() {
    const bridge = window.MVCI_VECTOR_BRIDGE_0200;
    if (!bridge?.scrapeNow) throw new Error('Mission Vector schedule collector is not loaded.');
    await bridge.scrapeNow();
    const status = bridge.status?.() || {};
    if (status.status === 'error') throw new Error(status.lastError || 'Fresh Vector census failed.');
    if (status.status !== 'sent-good') {
      throw new Error(`Fresh Vector census did not pass the full-census safety gate (${status.status || 'unknown'}). Preview stopped.`);
    }
    return status;
  }

  async function preflight(packageKey) {
    return request(`?action=action-preflight&packageKey=${encodeURIComponent(packageKey)}`);
  }

  async function previewPackage(pkg) {
    if (state.running) return;
    const date = displayedDate();
    if (!date || date !== pkg.targetDate) {
      alert(`Open Vector ListView for ${pkg.targetDate} before previewing this package.\n\nDisplayed date: ${date || 'unknown'}`);
      return;
    }
    state.running = true; state.lastError = ''; patchButtons();
    try {
      const census = await freshGoodCensus();
      const pf = await preflight(pkg.packageKey);
      const result = await request('', {
        method: 'POST',
        body: {
          version: VERSION,
          actionPreview: {
            packageKey: pkg.packageKey,
            displayedDate: date,
            sourceVersion: VERSION,
            preconditionMatch: pf?.preflight?.ready === true,
            evidence: {
              freshCensusStatus: census.status,
              lastCapture: census.lastCapture || null,
              serverPreflight: pf?.preflight || null,
              automatedWriteAttempted: false,
            },
          },
        },
      });
      const preview = result?.actionPreview;
      if (preview?.ready) {
        alert(`READ-ONLY PREVIEW READY\n\n${pkg.summary}\n\nNo Vector write was performed. Open Rebel Command → Vector Actions for the manual single-write test gate.`);
      } else {
        alert(`PREVIEW BLOCKED\n\n${pkg.summary}\n\nReason: ${preview?.preflight?.reason || 'preconditions did not match'}\n\nNo Vector write was performed.`);
      }
    } catch (error) {
      state.lastError = clean(error?.message || error);
      alert(`Action preview failed safely.\n\n${state.lastError}\n\nNo Vector write was performed.`);
    } finally {
      state.running = false;
      await refreshWorklist();
      patchButtons();
    }
  }

  async function verifyPackage(pkg) {
    if (state.running) return;
    const date = displayedDate();
    if (!date || date !== pkg.targetDate) {
      alert(`Open Vector ListView for ${pkg.targetDate} before reread verification.\n\nDisplayed date: ${date || 'unknown'}`);
      return;
    }
    state.running = true; state.lastError = ''; patchButtons();
    try {
      const census = await freshGoodCensus();
      const pf = await preflight(pkg.packageKey);
      const matchesTarget = pf?.preflight?.reason === 'already_in_target_state';
      const result = await request('', {
        method: 'POST',
        body: {
          version: VERSION,
          actionVerification: {
            packageKey: pkg.packageKey,
            displayedDate: date,
            sourceVersion: VERSION,
            match: matchesTarget,
            evidence: {
              freshCensusStatus: census.status,
              lastCapture: census.lastCapture || null,
              serverPreflight: pf?.preflight || null,
              automatedWriteAttempted: false,
            },
          },
        },
      });
      if (result?.actionVerification?.verified) {
        alert(`REREAD VERIFIED\n\n${pkg.summary}\n\nThe fresh Vector read matches the intended package state.`);
      } else {
        alert(`REREAD MISMATCH\n\n${pkg.summary}\n\nThe fresh Vector read did not match the intended package. Stop here and review Rebel Command.`);
      }
    } catch (error) {
      state.lastError = clean(error?.message || error);
      alert(`Reread verification failed safely.\n\n${state.lastError}`);
    } finally {
      state.running = false;
      await refreshWorklist();
      patchButtons();
    }
  }

  function matching(type, stage) {
    const date = displayedDate();
    return state.packages.filter(p => p.actionType === type && p.stage === stage && p.targetDate === date);
  }

  function findBridgeButton(prefixes) {
    const card = document.getElementById('vs-vector-bridge-v0200');
    if (!card) return null;
    const list = Array.isArray(prefixes) ? prefixes : [prefixes];
    return [...card.querySelectorAll('button')].find(b => list.some(prefix => clean(b.textContent).toUpperCase().startsWith(prefix)));
  }

  function wireButton(button, type, label) {
    if (!button) return;
    const verify = matching(type, 'reread_verification');
    const queued = matching(type, 'preview');
    const rows = verify.length ? verify : queued;
    const mode = verify.length ? 'VERIFY' : 'PREVIEW';
    const disabled = state.running || rows.length === 0 || !paired();
    const text = `${mode} ${label} · ${rows.length}`;
    const title = rows.length
      ? `${mode === 'VERIFY' ? 'Fresh reread verification' : 'Read-only preview'} for ${rows[0].targetDate}. No automated Vector write exists.`
      : `No ${label.toLowerCase()} action package is ready for the displayed date.`;
    const signature = JSON.stringify({ type, mode, count: rows.length, disabled, date: displayedDate(), first: rows[0]?.packageKey || '' });

    if (button.dataset.mvciActionSignature !== signature) {
      button.dataset.mvciActionSignature = signature;
      if (button.disabled !== disabled) button.disabled = disabled;
      if (button.textContent !== text) button.textContent = text;
      if (button.title !== title) button.title = title;
      button.onclick = async event => {
        event.preventDefault(); event.stopPropagation();
        const currentVerify = matching(type, 'reread_verification');
        const current = currentVerify.length ? currentVerify : matching(type, 'preview');
        if (!current.length) return;
        if (current.length > 1) {
          const chosen = current[0];
          const ok = confirm(`${current.length} ${label.toLowerCase()} packages match this date.\n\nRun the first package now?\n\n${chosen.summary}\n\nNo automated Vector write will occur.`);
          if (!ok) return;
        }
        const pkg = current[0];
        if (currentVerify.length) await verifyPackage(pkg);
        else await previewPackage(pkg);
      };
    }
  }

  function patchButtons() {
    const schedule = findBridgeButton(['INPUT SCHEDULE','PREVIEW SCHEDULE','VERIFY SCHEDULE']);
    const overtime = findBridgeButton(['INPUT OT SIGNUPS','PREVIEW OT SIGNUPS','VERIFY OT SIGNUPS']);
    wireButton(schedule, 'schedule', 'SCHEDULE');
    wireButton(overtime, 'overtime_signup', 'OT SIGNUPS');
  }

  setInterval(patchButtons, 2500);
  setInterval(refreshWorklist, 8000);
  setTimeout(refreshWorklist, 2200);
  setTimeout(patchButtons, 1200);

  window.MVCI_VECTOR_ACTION_PREVIEW_0221 = {
    version: VERSION,
    refreshWorklist,
    previewPackage,
    verifyPackage,
    status: () => ({ paired: paired(), running: state.running, packages: state.packages.length, lastError: state.lastError, lastRefreshAt: state.lastRefreshAt }),
  };
})();