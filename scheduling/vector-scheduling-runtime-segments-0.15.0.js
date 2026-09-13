(function () {
  'use strict';

  const VERSION = '0.15.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CSHIFT_ANCHOR = '2026-09-10';
  const TRUCK = 'Truck 504';

  if (window.top !== window.self || window.__mvciVectorSegments0150) return;
  window.__mvciVectorSegments0150 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const escRe = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uid = (...parts) => parts.map(v => clean(v).toLowerCase()).join('|');
  const timeRangeRe = /\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/;
  const navNoiseRe = /CallBack(?:™)?\s+Board|My\s+Personal\s+Calendar|My\s+Time\s+Off\s+Bank|My\s+Personnel\s+File|My\s+Certifications|Set\s+Availability|Edit\s+Profile|My\s+Devices|Log-?Out/i;

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function saveState(state) {
    if (!state) return;
    state.metadata = state.metadata || {};
    state.metadata.updatedAt = new Date().toISOString();
    state.metadata.segmentExtractorVersion = VERSION;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function people(state) {
    return [...(state?.settings?.firefighters || []), ...(state?.settings?.command || [])];
  }

  function personKind(state, personId) {
    return people(state).find(p => p.id === personId)?.kind || 'other';
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

  function validOperationalRow(row) {
    if (!row?.found) return false;
    const text = clean(row.rawText);
    if (!text) return false;
    if (navNoiseRe.test(text) && !timeRangeRe.test(text)) return false;
    if (!timeRangeRe.test(text)) return false;
    return true;
  }

  function hardenResults(out) {
    const state = loadState();
    if (!state || !Array.isArray(out?.results)) return out;
    let rejected = 0;
    for (const result of out.results) {
      if (result.found && !validOperationalRow(result)) {
        rejected++;
        result.found = false;
        result.rawText = '';
        result.dutyCode = null;
        result.assignment = null;
        result.assignmentGroup = null;
        result.contextText = '';
        result.captureQuality = 'rejected-non-operational-row';
      }
      const stored = (state.observations || []).find(o =>
        o.date === result.date && o.personId === result.personId && o.capturedAt === result.capturedAt && o.source === result.source
      );
      if (stored) Object.assign(stored, result, { hardeningVersion: VERSION });
    }
    state.metadata = state.metadata || {};
    state.metadata.lastCaptureRejectedNonOperationalRows = rejected;
    saveState(state);
    return out;
  }

  function roleHint(state, observation, dutyCode, raw) {
    const kind = personKind(state, observation.personId);
    const group = clean(observation.assignmentGroup || observation.assignment);
    const code = clean(dutyCode).toUpperCase();
    const text = clean(raw).toUpperCase();

    if (kind === 'firefighter') {
      if (group && !/^TRUCK\s+504$/i.test(group)) {
        if (/DEPLOYMENT/i.test(group)) return 'Deployment';
        if (/EMPLOYEES\s+OFF/i.test(group)) return 'Off';
        if (/TRAINING/i.test(group)) return 'Training';
        if (/^(TRUCK|ENGINE|MEDIC|QUINT)\s+\d+$/i.test(group)) return 'Swing';
      }
      if (/\bTADE\b/.test(text) || /^DE(?:-A)?$/.test(code) || /\bDE(?:-A)?\b/.test(text)) return 'TADE';
      if (code === 'TM' || /\bTM\b/.test(text)) return 'Tiller';
      if (/^FF(?:A|B)?$/.test(code) || /\bFF(?:A|B)?\b/.test(text)) return 'Firefighter';
      return 'Unknown';
    }

    if (code === 'TAC' || /\bTAC\b/.test(text)) return 'Temporary Captain';
    if (/\bCAPT\b/.test(text)) return 'Captain';
    if (/^DE(?:-A)?$/.test(code) || /\bDE(?:-A)?\b/.test(text)) return 'Engineer';
    return 'Unknown';
  }

  function segmentPattern(personName) {
    return new RegExp(
      `${escRe(personName)}\\s+(.{0,260}?)(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})\\s+(\\d+(?:\\.\\d+)?)\\s*hrs?(?:\\s+(\\d+)\\s*min)?\\b`,
      'ig'
    );
  }

  function extractSegmentsForObservation(state, observation) {
    if (!observation?.found || !observation?.date || !observation?.personName) return [];
    const corpus = clean(
      observation.contextText && observation.contextText.toLowerCase().includes(observation.personName.toLowerCase())
        ? observation.contextText
        : observation.rawText
    );
    if (!corpus) return [];

    const pattern = segmentPattern(observation.personName);
    const segments = [];
    let match;
    let index = 0;
    while ((match = pattern.exec(corpus))) {
      index++;
      const details = clean(match[1]);
      const startTime = match[2];
      const endTime = match[3];
      const durationHours = Number(match[4]) + (Number(match[5] || 0) / 60);
      const rawText = clean(`${observation.personName} ${details} ${startTime} - ${endTime} ${match[4]} hrs${match[5] ? ` ${match[5]} min` : ''}`);
      const dutyCode = window.VectorSchedulingEngine?.detectDutyCode?.(rawText) || null;
      const c = cShiftInfo(observation.date);
      const hint = roleHint(state, observation, dutyCode, rawText);
      const key = uid(observation.date, observation.personId, observation.assignmentGroup, startTime, endTime, dutyCode, hint, index);
      segments.push({
        segmentKey: key,
        date: observation.date,
        personId: observation.personId,
        personName: observation.personName,
        capturedAt: observation.capturedAt,
        assignmentGroup: observation.assignmentGroup || observation.assignment || null,
        startTime,
        endTime,
        durationHours,
        dutyCode,
        roleHint: hint,
        isCShift: c.isCShift,
        cShiftDay: c.day,
        rawText,
        sourceObservationKey: uid(observation.date, observation.personId, observation.capturedAt, observation.source),
        source: 'vector-segment-extractor-v0150',
        verified: observation.captureQuality === 'row+group' && Number.isFinite(durationHours) && durationHours > 0,
        sequenceIndex: index,
      });
      if (pattern.lastIndex === match.index) pattern.lastIndex++;
    }
    return segments;
  }

  function upsertSegments(state, segments) {
    state.segments = Array.isArray(state.segments) ? state.segments : [];
    for (const row of segments) {
      const i = state.segments.findIndex(x => x.segmentKey === row.segmentKey);
      if (i >= 0) state.segments[i] = row;
      else state.segments.push(row);
    }
  }

  function extractLatest(out) {
    const state = loadState();
    if (!state || !Array.isArray(out?.results)) return [];
    const segments = out.results.flatMap(row => extractSegmentsForObservation(state, row));
    upsertSegments(state, segments);
    state.metadata = state.metadata || {};
    state.metadata.lastSegmentCaptureAt = out.capturedAt || new Date().toISOString();
    state.metadata.lastSegmentCaptureDate = out.date || null;
    state.metadata.lastSegmentCount = segments.length;
    state.metadata.lastPartialSegmentCount = segments.filter(s => s.durationHours < 23.99).length;
    saveState(state);
    return segments;
  }

  function installCaptureWrapper() {
    const reader = window.MVCI_VECTOR_READER_0120;
    if (!reader || reader.__segmentWrapper0150) return false;
    const original = reader.captureNow.bind(reader);
    reader.__originalCaptureNow0120 = original;
    reader.captureNow = function () {
      const out = hardenResults(original());
      out.segments = extractLatest(out);
      return out;
    };
    reader.version = VERSION;
    reader.__segmentWrapper0150 = true;
    window.MVCI_VECTOR_READER_0150 = reader;
    return true;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function refreshDiagnostics() {
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;
    const state = loadState();
    if (!state) return;
    let card = panel.querySelector('#vs-segment-diagnostics-v0150');
    if (!card) {
      card = document.createElement('div');
      card.id = 'vs-segment-diagnostics-v0150';
      card.className = 'vs-card';
      const capture = panel.querySelector('#vs-capture-diagnostics-v0120');
      if (capture) capture.insertAdjacentElement('afterend', card);
      else panel.appendChild(card);
    }
    const date = state.metadata?.lastSegmentCaptureDate;
    const capturedAt = state.metadata?.lastSegmentCaptureAt;
    const rows = (state.segments || []).filter(s => s.date === date && (!capturedAt || s.capturedAt === capturedAt));
    const partial = rows.filter(s => s.durationHours < 23.99);
    const sig = `${date}|${capturedAt}|${rows.length}|${partial.length}|${state.metadata?.lastCaptureRejectedNonOperationalRows || 0}`;
    if (card.dataset.sig === sig) return;
    card.dataset.sig = sig;
    card.innerHTML = `<h3>Precision duty segments <span class="vs-muted">${VERSION}</span></h3><div class="vs-muted">${esc(date || 'No capture yet')} · ${rows.length} segment(s) · ${partial.length} partial segment(s) · ${Number(state.metadata?.lastCaptureRejectedNonOperationalRows || 0)} non-operational false match(es) rejected</div>${rows.length ? `<table class="vs-table"><tr><th>Person</th><th>Group</th><th>Time</th><th>Hours</th><th>Role hint</th></tr>${rows.map(r => `<tr><td>${esc(r.personName)}</td><td>${esc(r.assignmentGroup || '—')}</td><td>${esc(r.startTime)}–${esc(r.endTime)}</td><td>${Number(r.durationHours).toFixed(2)}</td><td>${esc(r.roleHint || '—')}</td></tr>`).join('')}</table>` : ''}`;
  }

  function wireCaptureButton() {
    const reader = window.MVCI_VECTOR_READER_0120;
    const btn = document.getElementById('vs-capture');
    if (!reader || !btn || btn.dataset.mvciV0150 === '1') return;
    btn.dataset.mvciV0150 = '1';
    btn.onclick = () => {
      try {
        const out = reader.captureNow();
        refreshDiagnostics();
        const missing = out.results.filter(r => !r.found).map(r => r.personName);
        const partial = (out.segments || []).filter(s => s.durationHours < 23.99).length;
        let msg = `Captured ${out.results.filter(r => r.found).length}/${out.results.length} tracked people for ${out.date} from ${out.mode}.`;
        msg += `\nPrecision segments: ${(out.segments || []).length}${partial ? ` (${partial} partial)` : ''}.`;
        if (missing.length) msg += `\nMissing/rejected: ${missing.join(', ')}`;
        alert(msg);
      } catch (error) {
        alert(`Capture failed: ${error?.message || error}`);
      }
    };
  }

  function tick() {
    installCaptureWrapper();
    wireCaptureButton();
    refreshDiagnostics();
  }

  setInterval(tick, 900);
  setTimeout(tick, 250);
})();
