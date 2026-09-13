(function () {
  'use strict';

  const VERSION = '0.14.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CONFIG_KEY = 'missionVectorRebelCorePairing_v1';
  const SENT_KEY = 'missionVectorRebelCoreSent_v1';
  const STATUS_KEY = 'missionVectorRebelCoreStatus_v1';
  const CSHIFT_ANCHOR = '2026-09-10';
  const MAX_BATCH = 50;

  if (window.top !== window.self || window.__mvciRebelCoreTelemetry0140) return;
  window.__mvciRebelCoreTelemetry0140 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();

  function loadJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function config() {
    const value = loadJson(CONFIG_KEY, null);
    if (!value?.endpoint || !value?.token || !/^https:\/\//i.test(value.endpoint)) return null;
    return value;
  }

  function state() {
    return loadJson(STATE_KEY, null);
  }

  function status() {
    return loadJson(STATUS_KEY, { paired: false, lastAttemptAt: null, lastSuccessAt: null, lastError: null, accepted: 0 });
  }

  function setStatus(patch) {
    const next = { ...status(), ...patch };
    saveJson(STATUS_KEY, next);
    return next;
  }

  function parsePairing(payload) {
    const value = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!value || typeof value !== 'object') throw new Error('Pairing payload must be JSON.');
    const endpoint = clean(value.endpoint);
    const token = clean(value.token);
    const deviceId = clean(value.deviceId || value.device_id);
    if (!/^https:\/\//i.test(endpoint)) throw new Error('Pairing endpoint must use HTTPS.');
    if (token.length < 32) throw new Error('Pairing token is invalid.');
    return { endpoint, token, deviceId, pairedAt: nowIso() };
  }

  async function configure(payload) {
    const parsed = parsePairing(payload);
    saveJson(CONFIG_KEY, parsed);
    setStatus({ paired: true, lastError: null });
    await syncNow({ forceActivities: true });
    refreshCard();
    return true;
  }

  function forgetPairing() {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(SENT_KEY);
    setStatus({ paired: false, lastError: null });
    refreshCard();
  }

  async function post(events) {
    const cfg = config();
    if (!cfg) throw new Error('Rebel Core is not paired.');
    const list = Array.isArray(events) ? events : [events];
    if (!list.length) return { ok: true, accepted: 0, failed: 0 };
    setStatus({ paired: true, lastAttemptAt: nowIso() });
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        'x-rebel-device-key': cfg.token,
      },
      body: JSON.stringify(list.length === 1 ? list[0] : { events: list }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      const message = clean(body?.error || body?.detail || `HTTP ${response.status}`);
      setStatus({ lastError: message || 'Unknown Rebel Core telemetry error' });
      throw new Error(message || `HTTP ${response.status}`);
    }
    setStatus({ lastSuccessAt: nowIso(), lastError: null, accepted: Number(body?.accepted || 0) });
    return body;
  }

  function dayDiff(date, anchor = CSHIFT_ANCHOR) {
    const a = new Date(`${anchor}T12:00:00Z`);
    const b = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }

  function cShiftInfo(date) {
    const diff = dayDiff(date);
    if (diff == null) return { isCShift: false, day: null };
    const mod = ((diff % 6) + 6) % 6;
    if (mod === 0) return { isCShift: true, day: 1 };
    if (mod === 1) return { isCShift: true, day: 2 };
    return { isCShift: false, day: null };
  }

  function durationHours(raw) {
    const text = clean(raw);
    const m = text.match(/\b(\d+(?:\.\d+)?)\s*hrs?(?:\s+(\d+)\s*min)?\b/i);
    if (!m) return undefined;
    return Number(m[1]) + (Number(m[2] || 0) / 60);
  }

  function classifyActivity(observation) {
    const text = clean(`${observation.assignmentGroup || observation.assignment || ''} ${observation.rawText || ''}`).toLowerCase();
    if (/deployment|disaster relief|tifmas|emtf/.test(text)) return 'deployment';
    if (/training|class|academy|student/.test(text)) return 'training';
    if (/vacation|holiday|sick|leave|time off|personal sick/.test(text)) return 'leave';
    if (/additional time|\bovertime\b|\bot\b/.test(text)) return 'overtime';
    if (/\bsub\b|substitute/.test(text)) return 'sub';
    if (observation.assignmentGroup || observation.assignment) return 'regular';
    return 'unknown';
  }

  function activityEvent(observation) {
    const date = clean(observation.date);
    const c = cShiftInfo(date);
    return {
      kind: 'vector_activity',
      program_key: 'vector-scheduling',
      activity_key: `vector-scheduling:${date}:${clean(observation.personId || observation.personName).toLowerCase()}`,
      person_key: clean(observation.personId),
      person_name: clean(observation.personName || observation.personId) || 'Unknown',
      activity_date: date,
      duration_hours: durationHours(observation.rawText),
      is_c_shift: c.isCShift,
      c_shift_day: c.day,
      affects_riding_ratio: false,
      activity_type: classifyActivity(observation),
      assignment_group: clean(observation.assignmentGroup || observation.assignment),
      apparatus: /^Truck\s+504$/i.test(clean(observation.assignmentGroup || observation.assignment)) ? 'Truck 504' : '',
      duty_code: clean(observation.dutyCode),
      activity_code: clean(observation.rawText),
      source: clean(observation.source || 'vector-scheduling'),
      source_view: clean(observation.pageMode),
      raw_text: clean(observation.rawText),
      verified: Boolean(observation.found && observation.captureQuality === 'row+group'),
      captured_at: clean(observation.capturedAt) || nowIso(),
      notes: 'Rebel Core factual activity record. Riding-position credit remains owned by Vector Scheduling reconciliation.',
    };
  }

  function activityRevisionKey(observation) {
    return `${clean(observation.date)}|${clean(observation.personId || observation.personName).toLowerCase()}|${clean(observation.capturedAt)}|${clean(observation.rawText)}`;
  }

  function sentState() {
    const value = loadJson(SENT_KEY, { activities: {}, syncRuns: {}, health: {} });
    if (!value.activities) value.activities = {};
    if (!value.syncRuns) value.syncRuns = {};
    if (!value.health) value.health = {};
    return value;
  }

  function pruneMap(map, max = 5000) {
    const keys = Object.keys(map || {});
    if (keys.length <= max) return map;
    const keep = keys.slice(keys.length - max);
    return Object.fromEntries(keep.map(k => [k, map[k]]));
  }

  async function sendHeartbeats(scheduleState) {
    const loader = window.__mvciLiveLoader || {};
    const runtimeVersion = clean(loader.runtimeVersion || scheduleState?.metadata?.runtimeVersion || VERSION);
    const events = [
      {
        kind: 'heartbeat', connection_key: 'vector-scheduling-reader', name: 'Vector Scheduling Reader', type: 'vector', component: 'ListView DOM reader',
        status: 'connected', version: runtimeVersion, source: 'Vector Scheduling', occurred_at: nowIso(),
        details: `Runtime ${runtimeVersion}; last captured ${scheduleState?.metadata?.lastCaptureAt || 'none'}.`,
      },
      {
        kind: 'heartbeat', connection_key: 'tampermonkey-loader', name: 'Tampermonkey LIVE Loader', type: 'tampermonkey', component: 'Vector Scheduling loader',
        status: 'connected', version: clean(loader.loaderVersion || scheduleState?.metadata?.liveLoaderVersion), source: 'Tampermonkey', occurred_at: nowIso(),
        details: 'Mission Vector Check It scheduling loader is running in the authorized Vector browser.',
      },
    ];
    return post(events);
  }

  async function sendBackfillState(scheduleState, sent) {
    const runs = Array.isArray(scheduleState?.backfillRuns) ? scheduleState.backfillRuns : [];
    const latest = runs[runs.length - 1];
    if (!latest?.id) return 0;
    const fingerprint = JSON.stringify([latest.status, latest.captures, latest.lastCapturedDate, latest.error, latest.completedAt, latest.updatedAt]);
    if (sent.syncRuns[latest.id] === fingerprint) return 0;
    await post({
      kind: 'sync_run',
      sync_key: `vector-scheduling:${latest.id}`,
      source: 'Vector Scheduling ListView',
      target: 'Rebel Core',
      status: latest.status === 'complete' ? 'success' : latest.status === 'running' ? 'running' : latest.status === 'stopped-user' ? 'stopped' : latest.status === 'stopped-error' ? 'error' : 'partial',
      started_at: latest.startedAt || nowIso(),
      completed_at: latest.completedAt || latest.stoppedAt || (latest.status === 'stopped-error' ? latest.updatedAt : undefined),
      records_seen: Number(latest.captures || 0),
      records_created: Number(latest.captures || 0),
      records_updated: 0,
      records_skipped: 0,
      error_message: clean(latest.error),
      details: { startDate: latest.startDate, startingDate: latest.startingDate, lastCapturedDate: latest.lastCapturedDate, runtimeVersion: scheduleState?.metadata?.runtimeVersion },
    });
    sent.syncRuns[latest.id] = fingerprint;
    return 1;
  }

  async function sendBackfillHealth(scheduleState, sent) {
    const error = clean(scheduleState?.metadata?.lastBackfillError);
    const date = clean(scheduleState?.metadata?.lastBackfillDate);
    if (!error) return 0;
    const key = `vector-scheduling-backfill:${date}:${error}`;
    if (sent.health[key]) return 0;
    await post({
      kind: 'health_event', event_key: key, component: 'Vector Scheduling historical backfill', status: 'error', severity: 'medium',
      message: `Historical backfill stopped safely at ${date || 'an unknown date'}: ${error}`, occurred_at: scheduleState?.metadata?.updatedAt || nowIso(),
      source: `Vector Scheduling ${scheduleState?.metadata?.runtimeVersion || ''}`, details: { captures: scheduleState?.metadata?.lastBackfillCaptures, lastCapturedDate: date, error },
    });
    sent.health[key] = nowIso();
    return 1;
  }

  async function sendActivities(scheduleState, sent, force = false) {
    const observations = Array.isArray(scheduleState?.observations) ? scheduleState.observations : [];
    const latestByDayPerson = new Map();
    for (const o of observations) {
      if (!o?.found || !o?.date || !(o?.personId || o?.personName)) continue;
      const key = `${o.date}|${o.personId || o.personName}`;
      const prev = latestByDayPerson.get(key);
      if (!prev || String(o.capturedAt || '') > String(prev.capturedAt || '')) latestByDayPerson.set(key, o);
    }
    const pending = [];
    for (const o of latestByDayPerson.values()) {
      const key = `${o.date}|${o.personId || o.personName}`;
      const rev = activityRevisionKey(o);
      if (!force && sent.activities[key] === rev) continue;
      pending.push({ key, rev, event: activityEvent(o) });
    }
    pending.sort((a, b) => String(a.event.activity_date).localeCompare(String(b.event.activity_date)));
    let sentCount = 0;
    for (let i = 0; i < pending.length; i += MAX_BATCH) {
      const batch = pending.slice(i, i + MAX_BATCH);
      const result = await post(batch.map(x => x.event));
      if (Number(result?.failed || 0) > 0) throw new Error(`Rebel Core rejected ${result.failed} activity records.`);
      for (const item of batch) sent.activities[item.key] = item.rev;
      sentCount += batch.length;
      saveJson(SENT_KEY, { ...sent, activities: pruneMap(sent.activities) });
    }
    return sentCount;
  }

  async function syncNow({ forceActivities = false } = {}) {
    const cfg = config();
    if (!cfg) {
      setStatus({ paired: false });
      refreshCard();
      return { paired: false };
    }
    const scheduleState = state();
    if (!scheduleState) throw new Error('Vector Scheduling state is not available.');
    const sent = sentState();
    try {
      await sendHeartbeats(scheduleState);
      const backfills = await sendBackfillState(scheduleState, sent);
      const health = await sendBackfillHealth(scheduleState, sent);
      const activities = await sendActivities(scheduleState, sent, forceActivities);
      saveJson(SENT_KEY, { activities: pruneMap(sent.activities), syncRuns: pruneMap(sent.syncRuns, 500), health: pruneMap(sent.health, 1000) });
      setStatus({ paired: true, lastSuccessAt: nowIso(), lastError: null });
      refreshCard();
      return { paired: true, activities, backfills, health };
    } catch (error) {
      setStatus({ paired: true, lastError: clean(error?.message || error) });
      refreshCard();
      throw error;
    }
  }

  function cardHtml() {
    const cfg = config();
    const s = status();
    if (!cfg) {
      return `<h3>Rebel Core sync <span class="vs-muted">${VERSION}</span></h3><div class="vs-muted" style="margin-bottom:7px">Not paired. Rebel Core keeps health, usage and activity management out of the daily Vector screen.</div><button id="vs-rebel-core-pair" class="vs-btn secondary">Pair Rebel Core</button>`;
    }
    const health = s.lastError ? `Error: ${clean(s.lastError)}` : s.lastSuccessAt ? `Last sync ${new Date(s.lastSuccessAt).toLocaleString()}` : 'Paired; waiting for first sync';
    return `<h3>Rebel Core sync <span class="vs-muted">${VERSION}</span></h3><div style="margin-bottom:7px"><b style="color:#27ae60">Linked</b> · <span class="vs-muted">${health}</span></div><div style="display:flex;gap:6px"><button id="vs-rebel-core-sync" class="vs-btn secondary">Sync now</button><button id="vs-rebel-core-forget" class="vs-btn secondary">Forget pairing</button></div>`;
  }

  function refreshCard() {
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;
    let card = panel.querySelector('#vs-rebel-core-sync-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'vs-rebel-core-sync-card';
      card.className = 'vs-card';
      panel.appendChild(card);
    }
    const html = cardHtml();
    if (card.dataset.html !== html) {
      card.dataset.html = html;
      card.innerHTML = html;
    }
    const pair = card.querySelector('#vs-rebel-core-pair');
    if (pair && !pair.dataset.wired) {
      pair.dataset.wired = '1';
      pair.onclick = async () => {
        const raw = prompt('Paste the private Rebel Core pairing JSON copied from Rebel Command.');
        if (!raw) return;
        try {
          await configure(raw);
          alert('Rebel Core paired and initial scheduling sync completed.');
        } catch (error) {
          alert(`Rebel Core pairing failed.\n\n${error?.message || error}`);
        }
      };
    }
    const sync = card.querySelector('#vs-rebel-core-sync');
    if (sync && !sync.dataset.wired) {
      sync.dataset.wired = '1';
      sync.onclick = async () => {
        sync.disabled = true;
        try {
          const result = await syncNow();
          alert(`Rebel Core sync complete.\n\n${result.activities || 0} activity records uploaded.`);
        } catch (error) {
          alert(`Rebel Core sync failed.\n\n${error?.message || error}`);
        } finally {
          sync.disabled = false;
        }
      };
    }
    const forget = card.querySelector('#vs-rebel-core-forget');
    if (forget && !forget.dataset.wired) {
      forget.dataset.wired = '1';
      forget.onclick = () => {
        if (confirm('Forget the Rebel Core pairing on this Vector browser? This does not delete Rebel Core history.')) forgetPairing();
      };
    }
  }

  let syncing = false;
  async function periodicSync() {
    if (syncing || !config()) return;
    syncing = true;
    try { await syncNow(); } catch (error) { console.warn('Rebel Core telemetry sync failed', error); } finally { syncing = false; }
  }

  setInterval(refreshCard, 1500);
  setInterval(periodicSync, 60000);
  setTimeout(refreshCard, 500);
  setTimeout(periodicSync, 5000);

  window.MVCI_REBEL_CORE_TELEMETRY = {
    version: VERSION,
    configure,
    forgetPairing,
    syncNow,
    status,
    isPaired: () => Boolean(config()),
  };
})();
