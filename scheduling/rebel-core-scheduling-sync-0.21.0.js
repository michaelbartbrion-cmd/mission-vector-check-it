(function () {
  'use strict';

  const VERSION = '0.21.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const PAIR_KEY = 'vectorStaffingCollectorPairing_v1';
  const SENT_KEY = 'missionVectorSchedulingCoreSync_v0210';
  const STATUS_KEY = 'missionVectorSchedulingCoreSyncStatus_v0210';
  const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const CARD_ID = 'vs-core-sync-v0210';
  const CSHIFT_ANCHOR = '2026-09-10';
  const CREDIT_CATEGORIES = new Set(['Firefighter', 'Swing', 'Tiller', 'TADE']);

  if (window.top !== window.self || window.__mvciSchedulingCoreSync0210) return;
  window.__mvciSchedulingCoreSync0210 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();

  function loadJson(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function state() { return loadJson(STATE_KEY, null); }
  function pairing() {
    const p = loadJson(PAIR_KEY, {});
    return { deviceId: clean(p.deviceId), token: clean(p.token), endpoint: clean(p.endpoint) || ENDPOINT };
  }
  function paired() { const p = pairing(); return !!(p.deviceId && p.token); }
  function status() { return loadJson(STATUS_KEY, { lastAttemptAt: null, lastSuccessAt: null, lastError: null }); }
  function setStatus(patch) { const next = { ...status(), ...patch }; saveJson(STATUS_KEY, next); return next; }
  function sentState() {
    const s = loadJson(SENT_KEY, { credits: {}, plans: {}, cases: {}, observations: {} });
    s.credits = s.credits || {}; s.plans = s.plans || {}; s.cases = s.cases || {}; s.observations = s.observations || {};
    return s;
  }

  function dayDiff(date, anchor = CSHIFT_ANCHOR) {
    const a = new Date(`${anchor}T12:00:00Z`), b = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }
  function isCShift(date) {
    const diff = dayDiff(date); if (diff == null) return false;
    const mod = ((diff % 6) + 6) % 6; return mod === 0 || mod === 1;
  }
  function eraStart(s) { return clean(s?.settings?.ratioStartDate || s?.ratioPeriods?.find?.(p => !p.endDate)?.startDate); }
  function peopleMap(s) {
    return new Map([...(s?.settings?.firefighters || []), ...(s?.settings?.command || [])].map(p => [p.id, p]));
  }
  function firefighterIds(s) { return new Set((s?.settings?.firefighters || []).map(p => p.id)); }

  function creditRows(s) {
    const start = eraStart(s), ff = firefighterIds(s), people = peopleMap(s);
    if (!start) return [];
    return (s?.history || [])
      .filter(h => h?.verified !== false && h?.date >= start && ff.has(h?.personId) && CREDIT_CATEGORIES.has(h?.credit) && isCShift(h.date))
      .map(h => {
        const key = `legacy:${h.date}:${h.personId}:${h.credit}:${clean(h.detail || h.credit)}`;
        const data = {
          credit_key: key,
          ratio_era_key: `ratio-era:${start}`,
          person_key: h.personId,
          person_name: people.get(h.personId)?.name || h.personId,
          credit_date: h.date,
          credit_category: h.credit,
          credit_value: 1,
          hours: Number(s?.settings?.shiftLengthHours || 24),
          source_type: 'legacy',
          source_key: clean(h.source || 'legacy-spreadsheet-manual'),
          verified: true,
          notes: `Imported verified whole-shift credit: ${clean(h.detail || h.credit)}.`,
          resolved_at: nowIso(),
        };
        return { key, revision: JSON.stringify([h.date,h.personId,h.credit,h.detail,h.verified,h.source]), data };
      });
  }

  function planRows(s) {
    const people = peopleMap(s);
    return (s?.plans || [])
      .filter(p => p?.date && p?.personId && CREDIT_CATEGORIES.has(p?.credit))
      .map(p => {
        const key = `plan:${p.date}:${p.personId}`;
        const data = {
          plan_key: key,
          block_start_date: p.blockStartDate || p.date,
          shift_date: p.date,
          person_key: p.personId,
          person_name: people.get(p.personId)?.name || p.personId,
          station: 'Station 4',
          unit: p.expectedAssignmentGroup || 'Truck 504',
          position_label: p.positionLabel || p.credit,
          planned_credit: p.credit,
          planned_hours: Number(p.plannedHours || s?.settings?.shiftLengthHours || 24),
          controlled_assignment: true,
          affects_ratio: (p.expectedAssignmentGroup || 'Truck 504') === 'Truck 504',
          expected_assignment_group: p.expectedAssignmentGroup || 'Truck 504',
          scenario: clean(p.scenario),
          status: p.supersededAt ? 'superseded' : 'active',
          source: clean(p.source || 'Vector Scheduling planner'),
          created_at: p.createdAt || nowIso(),
          superseded_at: p.supersededAt || undefined,
          notes: clean(p.note || p.notes),
        };
        return { key, revision: JSON.stringify([p.date,p.personId,p.credit,p.scenario,p.blockStartDate,p.createdAt,p.source,p.supersededAt]), data };
      });
  }

  function caseRows(s) {
    return (s?.reconciliationCases || [])
      .filter(c => c?.caseKey && c?.date && c?.personId && c?.personName && c?.issueType && c?.summary)
      .map(c => {
        const data = {
          case_key: c.caseKey,
          shift_date: c.date,
          person_key: c.personId,
          person_name: c.personName,
          issue_type: c.issueType,
          status: c.status || 'open',
          summary: c.summary,
          evidence: c.evidence || {},
          proposed_credit: CREDIT_CATEGORIES.has(c.proposedCredit) ? c.proposedCredit : undefined,
          resolution_credit: CREDIT_CATEGORIES.has(c.resolutionCredit) ? c.resolutionCredit : undefined,
          resolution_notes: clean(c.resolutionNotes),
          source: clean(c.source || `Vector Scheduling ${VERSION}`),
          created_at: c.createdAt || nowIso(),
          resolved_at: c.resolvedAt || undefined,
        };
        const revision = JSON.stringify([data.status,data.summary,data.proposed_credit,data.resolution_credit,data.resolution_notes,data.resolved_at,data.evidence]);
        return { key: c.caseKey, revision, data };
      });
  }

  function controlled(group) { return /^(Truck|Medic)\s+504$/i.test(clean(group)); }

  function segmentRows(s) {
    return (s?.segments || [])
      .filter(x => x?.segmentKey && x?.date && x?.personName && Number(x?.durationHours || 0) > 0)
      .map(x => {
        const group = clean(x.assignmentGroup);
        const key = `staffing-segment:${clean(x.segmentKey)}`;
        const data = {
          observation_id: key,
          batch_id: `historical:${x.date}`,
          work_date: x.date,
          captured_at: x.capturedAt || nowIso(),
          person_id: clean(x.personId),
          person_name: clean(x.personName),
          activity: 'Historical duty segment',
          assignment: group,
          assignment_group: group,
          duty_code: clean(x.dutyCode),
          shift_label: x.isCShift ? 'C Shift' : '',
          found: true,
          capture_quality: x.verified ? 'row+group' : 'row-only',
          raw_text: clean(x.rawText),
          source: clean(x.source || 'Vector Scheduling precision reader'),
          source_version: VERSION,
          page_mode: 'ListView',
          station: x.isCShift && controlled(group) ? 'Station 4' : '',
          unit: group,
          position_label: clean(x.roleHint || x.dutyCode),
          start_time: clean(x.startTime),
          end_time: clean(x.endTime),
          duration_hours: Number(x.durationHours || 0),
          is_c_shift: Boolean(x.isCShift),
          c_shift_day: Number(x.cShiftDay || 0) || undefined,
          station4_controlled: Boolean(x.isCShift && controlled(group)),
          verified: Boolean(x.verified),
          record_granularity: 'segment',
          role_hint: clean(x.roleHint),
          source_observation_key: clean(x.segmentKey),
        };
        const revision = JSON.stringify([x.date,x.personId,x.assignmentGroup,x.startTime,x.endTime,x.durationHours,x.dutyCode,x.roleHint,x.rawText,x.isCShift,x.verified,x.capturedAt]);
        return { key, revision, data };
      });
  }

  async function postPart(field, rows) {
    const p = pairing();
    if (!p.deviceId || !p.token) throw new Error('Mission Vector Bridge is not paired.');
    const response = await fetch(p.endpoint || ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${p.token}`,
        'X-Rebel-Device-ID': p.deviceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: VERSION,
        schedulingLedger: {
          sourceVersion: `scheduling-sync-${VERSION}`,
          credits: field === 'credits' ? rows.map(r => r.data) : [],
          plans: field === 'plans' ? rows.map(r => r.data) : [],
          reconciliationCases: field === 'cases' ? rows.map(r => r.data) : [],
          observations: field === 'observations' ? rows.map(r => r.data) : [],
        },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) throw new Error(clean(body?.error || `Rebel Command rejected scheduling sync (${response.status})`));
    const result = body?.schedulingLedger || {};
    if (Number(result.rejected || 0) > 0) throw new Error(`Rebel Command rejected ${result.rejected} scheduling record(s).`);
    return result;
  }

  async function sendPending(field, rows, sent, batchSize) {
    const pending = rows.filter(r => sent[field][r.key] !== r.revision);
    let count = 0;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      await postPart(field, batch);
      for (const row of batch) sent[field][row.key] = row.revision;
      saveJson(SENT_KEY, sent);
      count += batch.length;
    }
    return count;
  }

  function pendingCounts() {
    const s = state();
    if (!s) return { credits: 0, plans: 0, cases: 0, observations: 0, totalCredits: 0, totalPlans: 0, totalCases: 0, totalObservations: 0 };
    const sent = sentState(), credits = creditRows(s), plans = planRows(s), cases = caseRows(s), observations = segmentRows(s);
    return {
      totalCredits: credits.length, totalPlans: plans.length, totalCases: cases.length, totalObservations: observations.length,
      credits: credits.filter(r => sent.credits[r.key] !== r.revision).length,
      plans: plans.filter(r => sent.plans[r.key] !== r.revision).length,
      cases: cases.filter(r => sent.cases[r.key] !== r.revision).length,
      observations: observations.filter(r => sent.observations[r.key] !== r.revision).length,
    };
  }

  async function syncNow() {
    if (!paired()) { refreshCard(); return { paired: false, credits: 0, plans: 0, cases: 0, observations: 0 }; }
    setStatus({ lastAttemptAt: nowIso(), lastError: null });
    try {
      try { window.MVCI_VECTOR_RECONCILIATION_0150?.reconcile?.(); } catch (_) {}
      const s = state(); if (!s) throw new Error('Vector Scheduling state is not available.');
      const sent = sentState();
      const credits = await sendPending('credits', creditRows(s), sent, 150);
      const plans = await sendPending('plans', planRows(s), sent, 100);
      const cases = await sendPending('cases', caseRows(s), sent, 30);
      const observations = await sendPending('observations', segmentRows(s), sent, 100);
      setStatus({ lastSuccessAt: nowIso(), lastError: null, creditsSent: credits, plansSent: plans, casesSent: cases, observationsSent: observations });
      refreshCard();
      return { paired: true, credits, plans, cases, observations };
    } catch (error) {
      setStatus({ lastError: clean(error?.message || error) });
      refreshCard();
      throw error;
    }
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function refreshCard() {
    const panel = document.getElementById('mvci-vs-panel'); if (!panel) return;
    let card = panel.querySelector(`#${CARD_ID}`);
    if (!card) { card = document.createElement('div'); card.id = CARD_ID; card.className = 'vs-card'; panel.appendChild(card); }
    const c = pendingCounts(), st = status(), isPaired = paired();
    const signature=JSON.stringify({c,st,isPaired});
    if(card.dataset.renderSignature===signature)return;
    card.dataset.renderSignature=signature;
    const health = st.lastError ? `Error: ${esc(st.lastError)}` : st.lastSuccessAt ? `Last sync ${new Date(st.lastSuccessAt).toLocaleString()}` : 'Not synced yet';
    card.innerHTML = `<h3>Rebel Core scheduling sync <span class="vs-muted">${VERSION}</span></h3>
      <div class="vs-muted" style="margin-bottom:7px">${c.totalCredits} verified current-era credits · ${c.totalPlans} plans · ${c.totalCases} reconciliation cases · ${c.totalObservations} factual segments</div>
      <div class="vs-muted" style="margin-bottom:7px">Pending: ${c.credits} credits · ${c.plans} plans · ${c.cases} cases · ${c.observations} segments</div>
      ${isPaired ? `<div style="margin-bottom:7px">${health}</div><button id="vs-core-sync-now-v0210" class="vs-btn secondary">Sync to Rebel Core</button>` : '<div class="vs-muted">Use the Mission Vector Bridge pairing above; no second pairing is required.</div>'}`;
    const btn = card.querySelector('#vs-core-sync-now-v0210');
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      try {
        const result = await syncNow();
        alert(`Rebel Core scheduling sync complete.\n\n${result.credits} credit row(s), ${result.plans} plan row(s), ${result.cases} reconciliation case(s), and ${result.observations} factual segment(s) sent.`);
      } catch (error) {
        alert(`Scheduling sync failed.\n\n${error?.message || error}`);
      } finally { btn.disabled = false; }
    };
  }

  setInterval(refreshCard, 1800);
  // Stability quarantine: no periodic network synchronization without a user action.
  setTimeout(refreshCard, 1000);
  // Stability quarantine: no automatic synchronization at startup.

  window.MVCI_REBEL_CORE_SCHEDULING_SYNC_0210 = { version: VERSION, syncNow, pendingCounts };
})();