(function () {
  'use strict';

  const VERSION = '0.17.0-dev';
  const CONFIG_KEY = 'missionVectorRebelCorePairing_v1';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const LOAD_SENT_KEY = 'missionVectorSchedulingProgramLoad_v0170';

  if (window.top !== window.self || window.__mvciRebelCoreProgramHeartbeat0170) return;
  window.__mvciRebelCoreProgramHeartbeat0170 = { version: VERSION, startedAt: Date.now() };

  const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function pairing() {
    const cfg = loadJson(CONFIG_KEY, null);
    if (!cfg?.endpoint || !cfg?.token || !/^https:\/\//i.test(cfg.endpoint)) return null;
    return cfg;
  }

  function runtimeVersion() {
    const loader = window.__mvciLiveLoader || {};
    const state = loadJson(STATE_KEY, null);
    return clean(loader.runtimeVersion || state?.metadata?.runtimeVersion || VERSION);
  }

  async function post(event) {
    const cfg = pairing();
    if (!cfg) return false;
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        'x-rebel-device-key': cfg.token,
      },
      body: JSON.stringify(event),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json().catch(() => ({}));
    if (body?.ok === false) throw new Error(clean(body.error || body.detail || 'Rebel Core rejected heartbeat'));
    return true;
  }

  async function heartbeat() {
    if (!pairing()) return false;
    return post({
      kind: 'heartbeat',
      program_key: 'vector-scheduling',
      program_name: 'Vector Scheduling',
      program_category: 'scheduling',
      connection_key: 'vector-scheduling-runtime',
      name: 'Vector Scheduling Runtime',
      type: 'browser',
      component: 'Mission Vector Check It scheduling runtime',
      status: 'connected',
      version: runtimeVersion(),
      source: 'Vector Scheduling',
      occurred_at: nowIso(),
      details: 'Vector Scheduling runtime is loaded in the authorized Vector browser. Heartbeat is management telemetry only and does not write to Vector.',
    });
  }

  async function usageLoaded() {
    if (!pairing()) return false;
    const marker = `${runtimeVersion()}|${location.pathname}|${location.hash}|${new Date().toISOString().slice(0, 13)}`;
    if (sessionStorage.getItem(LOAD_SENT_KEY) === marker) return false;
    const ok = await post({
      kind: 'usage',
      program_key: 'vector-scheduling',
      program_name: 'Vector Scheduling',
      program_category: 'scheduling',
      action: 'runtime_loaded',
      event_type: 'lifecycle',
      module: 'scheduler',
      version: runtimeVersion(),
      success: true,
      occurred_at: nowIso(),
      source: 'Vector Scheduling',
      details: 'Scheduler runtime loaded. No Vector content, keystrokes, credentials, or cookies are included.',
    });
    if (ok) sessionStorage.setItem(LOAD_SENT_KEY, marker);
    return ok;
  }

  async function send() {
    if (!pairing()) return;
    try {
      await heartbeat();
      await usageLoaded();
    } catch (error) {
      console.warn('Vector Scheduling: Rebel Core program heartbeat failed without affecting scheduling.', error);
    }
  }

  setTimeout(send, 6500);
  setInterval(() => heartbeat().catch(() => {}), 120000);
  window.MVCI_REBEL_CORE_PROGRAM_HEARTBEAT_0170 = { version: VERSION, send, heartbeat };
})();
