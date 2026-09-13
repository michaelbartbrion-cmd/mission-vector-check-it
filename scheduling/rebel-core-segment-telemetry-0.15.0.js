(function () {
  'use strict';

  const VERSION = '0.15.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CONFIG_KEY = 'missionVectorRebelCorePairing_v1';
  const SENT_KEY = 'missionVectorRebelCoreSegmentSent_v1';
  const STATUS_KEY = 'missionVectorRebelCoreSegmentStatus_v1';
  const MAX_BATCH = 50;

  if (window.top !== window.self || window.__mvciRebelCoreSegments0150) return;
  window.__mvciRebelCoreSegments0150 = { version: VERSION, startedAt: Date.now() };

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

  function pairing() {
    const cfg = loadJson(CONFIG_KEY, null);
    if (!cfg?.endpoint || !cfg?.token || !/^https:\/\//i.test(cfg.endpoint)) return null;
    return cfg;
  }

  function status() {
    return loadJson(STATUS_KEY, { lastAttemptAt: null, lastSuccessAt: null, lastError: null, sent: 0 });
  }

  function setStatus(patch) {
    const next = { ...status(), ...patch };
    saveJson(STATUS_KEY, next);
    return next;
  }

  async function post(events) {
    const cfg = pairing();
    if (!cfg) throw new Error('Rebel Core is not paired.');
    const list = Array.isArray(events) ? events : [events];
    if (!list.length) return { ok: true, accepted: 0, failed: 0 };
    setStatus({ lastAttemptAt: nowIso() });
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
      setStatus({ lastError: message || 'Unknown Rebel Core segment telemetry error' });
      throw new Error(message || `HTTP ${response.status}`);
    }
    setStatus({ lastSuccessAt: nowIso(), lastError: null });
    return body;
  }

  function classify(segment) {
    const group = clean(segment.assignmentGroup).toLowerCase();
    const raw = clean(segment.rawText).toLowerCase();
    if (/deployment|disaster relief|tifmas|emtf/.test(`${group} ${raw}`)) return 'deployment';
    if (/training|class|academy|student/.test(`${group} ${raw}`)) return 'training';
    if (/vacation|holiday|sick|leave|time off|personal sick/.test(`${group} ${raw}`)) return 'leave';
    if (/additional time|\bovertime\b|\bot\b/.test(raw)) return 'overtime';
    if (/\bsub\b|substitute/.test(raw)) return 'sub';
    if (group || raw) return 'regular';
    return 'unknown';
  }

  function eventFor(segment) {
    return {
      kind: 'vector_activity',
      program_key: 'vector-scheduling',
      activity_key: `vector-segment:${segment.segmentKey}`,
      person_key: clean(segment.personId),
      person_name: clean(segment.personName) || 'Unknown',
      activity_date: clean(segment.date),
      duration_hours: Number(segment.durationHours),
      is_c_shift: Boolean(segment.isCShift),
      c_shift_day: segment.cShiftDay == null ? undefined : Number(segment.cShiftDay),
      affects_riding_ratio: false,
      activity_type: classify(segment),
      assignment_group: clean(segment.assignmentGroup),
      apparatus: /^Truck\s+504$/i.test(clean(segment.assignmentGroup)) ? 'Truck 504' : '',
      duty_code: clean(segment.dutyCode),
      activity_code: clean(segment.roleHint),
      source: clean(segment.source || 'vector-segment-extractor-v0150'),
      source_view: 'ListView',
      raw_text: clean(segment.rawText),
      verified: Boolean(segment.verified),
      notes: 'Precision Vector duty segment. Role hint is factual/inferred context only; final riding-ratio credit remains owned by Vector Scheduling reconciliation.',
      captured_at: clean(segment.capturedAt) || nowIso(),
      record_granularity: 'segment',
      segment_start_time: clean(segment.startTime),
      segment_end_time: clean(segment.endTime),
      role_hint: clean(segment.roleHint),
      sequence_index: Number(segment.sequenceIndex || 0),
      source_observation_key: clean(segment.sourceObservationKey),
    };
  }

  function allSegments() {
    const state = loadJson(STATE_KEY, null);
    return Array.isArray(state?.segments) ? state.segments.filter(s => s?.segmentKey && s?.date && s?.personName) : [];
  }

  function sentMap() {
    return loadJson(SENT_KEY, {});
  }

  function revision(segment) {
    return JSON.stringify([
      segment.date, segment.personId, segment.assignmentGroup, segment.startTime, segment.endTime,
      segment.durationHours, segment.dutyCode, segment.roleHint, segment.rawText, segment.verified, segment.capturedAt,
    ]);
  }

  function counts() {
    const sent = sentMap();
    const segments = allSegments();
    let pending = 0;
    for (const s of segments) if (sent[s.segmentKey] !== revision(s)) pending++;
    return { total: segments.length, pending, sent: segments.length - pending };
  }

  async function syncSegments() {
    if (!pairing()) {
      refreshCard();
      return { paired: false, sent: 0 };
    }
    const sent = sentMap();
    const pending = allSegments().filter(s => sent[s.segmentKey] !== revision(s));
    let sentCount = 0;

    try {
      for (let i = 0; i < pending.length; i += MAX_BATCH) {
        const batch = pending.slice(i, i + MAX_BATCH);
        const result = await post(batch.map(eventFor));
        if (Number(result?.failed || 0) > 0) throw new Error(`Rebel Core rejected ${result.failed} segment record(s).`);
        for (const s of batch) sent[s.segmentKey] = revision(s);
        saveJson(SENT_KEY, sent);
        sentCount += batch.length;
      }

      await post({
        kind: 'heartbeat',
        connection_key: 'vector-scheduling-segments',
        name: 'Vector Scheduling Precision Segments',
        type: 'vector',
        component: 'partial-day segment extractor',
        status: 'connected',
        version: VERSION,
        source: 'Vector Scheduling',
        occurred_at: nowIso(),
        details: `Precision segment extractor is running; ${allSegments().length} local segments indexed.`,
      });

      const current = status();
      setStatus({ lastSuccessAt: nowIso(), lastError: null, sent: Number(current.sent || 0) + sentCount });
      refreshCard();
      return { paired: true, sent: sentCount };
    } catch (error) {
      setStatus({ lastError: clean(error?.message || error) });
      refreshCard();
      throw error;
    }
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function refreshCard() {
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;
    let card = panel.querySelector('#vs-rebel-core-segments-v0150');
    if (!card) {
      card = document.createElement('div');
      card.id = 'vs-rebel-core-segments-v0150';
      card.className = 'vs-card';
      const sync = panel.querySelector('#vs-rebel-core-sync-card-v0140');
      if (sync) sync.insertAdjacentElement('afterend', card);
      else panel.appendChild(card);
    }
    const c = counts();
    const s = status();
    const paired = !!pairing();
    const health = s.lastError ? `Error: ${esc(s.lastError)}` : s.lastSuccessAt ? `Last sync ${new Date(s.lastSuccessAt).toLocaleString()}` : 'Not synced yet';
    card.innerHTML = `<h3>Precision segment sync <span class="vs-muted">${VERSION}</span></h3><div class="vs-muted" style="margin-bottom:7px">${paired ? `${c.total} indexed · ${c.sent} synced · ${c.pending} pending` : 'Pair Rebel Core above to enable segment sync.'}</div>${paired ? `<div style="margin-bottom:7px">${health}</div><button id="vs-rebel-core-segment-sync-v0150" class="vs-btn secondary">Sync precision segments</button>` : ''}`;
    const btn = card.querySelector('#vs-rebel-core-segment-sync-v0150');
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      try {
        const result = await syncSegments();
        alert(`Rebel Core precision sync complete.\n\n${result.sent || 0} segment record(s) sent.`);
      } catch (error) {
        alert(`Precision segment sync failed.\n\n${error?.message || error}`);
      } finally {
        btn.disabled = false;
      }
    };
  }

  setInterval(refreshCard, 1500);
  setInterval(() => { if (pairing()) syncSegments().catch(() => {}); }, 120000);
  setTimeout(refreshCard, 500);
  setTimeout(() => { if (pairing()) syncSegments().catch(() => {}); }, 8000);

  window.MVCI_REBEL_CORE_SEGMENTS_0150 = { version: VERSION, syncSegments, counts };
})();
