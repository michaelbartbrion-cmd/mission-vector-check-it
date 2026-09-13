(function () {
  'use strict';

  const VERSION = '0.19.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CONFIG_KEY = 'missionVectorRebelCorePairing_v1';
  const SENT_KEY = 'missionVectorRebelCoreStaffingSent_v0190';
  const MAX_BATCH = 50;

  if (window.top !== window.self || window.__mvciRebelCoreStaffing0190) return;
  window.__mvciRebelCoreStaffing0190 = { version: VERSION, startedAt: Date.now() };

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

  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function pairing() {
    const cfg = loadJson(CONFIG_KEY, null);
    if (!cfg?.endpoint || !cfg?.token || !/^https:\/\//i.test(cfg.endpoint)) return null;
    return cfg;
  }

  function state() {
    return loadJson(STATE_KEY, null);
  }

  function classify(segment) {
    const group = clean(segment.assignmentGroup).toLowerCase();
    const raw = clean(segment.rawText).toLowerCase();
    const both = `${group} ${raw}`;
    if (/deployment|disaster relief|tifmas|emtf/.test(both)) return 'deployment';
    if (/training|academy|class\b|student/.test(both)) return 'training';
    if (/vacation|holiday|sick|leave|time off|personal sick/.test(both)) return 'leave';
    if (/additional time|\bovertime\b|\bot\b|force hire|backfill/.test(both)) return 'overtime';
    if (/\bsub\b|substitute/.test(both)) return 'sub';
    if (group || raw) return 'scheduled';
    return 'unknown';
  }

  function controlled(group) {
    return /^(Truck|Medic)\s+504$/i.test(clean(group));
  }

  function eventFor(segment) {
    const group = clean(segment.assignmentGroup);
    const isC = Boolean(segment.isCShift);
    return {
      kind: 'staffing_observation',
      program_key: 'vector-scheduling',
      observation_key: `staffing-segment:${clean(segment.segmentKey)}`,
      schedule_date: clean(segment.date),
      shift_name: isC ? 'C Shift' : '',
      station: controlled(group) ? 'Station 4' : '',
      unit: group,
      position_label: clean(segment.roleHint || segment.dutyCode),
      person_key: clean(segment.personId),
      person_name: clean(segment.personName),
      duty_code: clean(segment.dutyCode),
      start_time: clean(segment.startTime),
      end_time: clean(segment.endTime),
      duration_hours: Number(segment.durationHours || 0),
      staffing_status: classify(segment),
      is_c_shift: isC,
      station4_controlled: isC && controlled(group),
      source: clean(segment.source || 'Vector Scheduling precision reader'),
      source_view: 'ListView',
      raw_text: clean(segment.rawText),
      captured_at: clean(segment.capturedAt) || nowIso(),
      verified: Boolean(segment.verified),
    };
  }

  function segments() {
    const s = state();
    return Array.isArray(s?.segments)
      ? s.segments.filter(x => x?.segmentKey && x?.date && x?.personName && Number(x?.durationHours || 0) > 0)
      : [];
  }

  function revision(segment) {
    return JSON.stringify([
      segment.date,
      segment.personId,
      segment.assignmentGroup,
      segment.startTime,
      segment.endTime,
      segment.durationHours,
      segment.dutyCode,
      segment.roleHint,
      segment.rawText,
      segment.isCShift,
      segment.verified,
      segment.capturedAt,
    ]);
  }

  function sentMap() {
    const value = loadJson(SENT_KEY, {});
    return value && typeof value === 'object' ? value : {};
  }

  function prune(map, max = 10000) {
    const keys = Object.keys(map || {});
    if (keys.length <= max) return map;
    return Object.fromEntries(keys.slice(keys.length - max).map(key => [key, map[key]]));
  }

  async function post(events) {
    const cfg = pairing();
    if (!cfg) throw new Error('Rebel Core is not paired.');
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'content-type': 'application/json', 'x-rebel-device-key': cfg.token },
      body: JSON.stringify(events.length === 1 ? events[0] : { events }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || Number(body?.failed || 0) > 0 || body?.ok === false) {
      throw new Error(clean(body?.error || body?.detail || `HTTP ${response.status}; failed ${body?.failed || 0}`));
    }
    return body;
  }

  function counts() {
    const sent = sentMap();
    const all = segments();
    const pending = all.filter(s => sent[s.segmentKey] !== revision(s));
    return {
      total: all.length,
      pending: pending.length,
      cShift: all.filter(s => s.isCShift).length,
      controlled: all.filter(s => s.isCShift && controlled(s.assignmentGroup)).length,
      offShift: all.filter(s => !s.isCShift).length,
    };
  }

  async function syncNow() {
    if (!pairing()) return { paired: false, sent: 0 };
    const sent = sentMap();
    const pending = segments().filter(s => sent[s.segmentKey] !== revision(s));
    let sentCount = 0;
    for (let i = 0; i < pending.length; i += MAX_BATCH) {
      const batch = pending.slice(i, i + MAX_BATCH);
      await post(batch.map(eventFor));
      for (const segment of batch) sent[segment.segmentKey] = revision(segment);
      saveJson(SENT_KEY, prune(sent));
      sentCount += batch.length;
    }
    if (sentCount) {
      await post([{
        kind: 'heartbeat',
        program_key: 'vector-scheduling',
        program_name: 'Vector Scheduling',
        program_category: 'scheduling',
        connection_key: 'vector-bridge-staffing-normalizer',
        name: 'Vector Bridge Staffing Normalizer',
        type: 'browser',
        component: 'shared scheduling / overtime staffing feed',
        status: 'connected',
        version: VERSION,
        source: 'Vector Scheduling',
        occurred_at: nowIso(),
        details: `Normalized ${segments().length} crew duty segment(s) for Rebel Core. C-shift Station 4 control remains separate from off-shift history.`,
      }]);
    }
    return { paired: true, sent: sentCount, ...counts() };
  }

  setTimeout(() => syncNow().catch(() => {}), 9000);
  setInterval(() => syncNow().catch(() => {}), 120000);

  window.MVCI_REBEL_CORE_STAFFING_0190 = { version: VERSION, syncNow, counts, eventFor };
})();
