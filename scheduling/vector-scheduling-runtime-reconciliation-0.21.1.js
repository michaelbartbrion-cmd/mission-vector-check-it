(function () {
  'use strict';

  const VERSION = '0.21.1-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const STATUS_KEY = 'missionVectorReconciliationStatus_v0211';
  const CARD_ID = 'vs-reconciliation-v0150';
  const CSHIFT_ANCHOR = '2026-09-10';
  const CREDIT_CATEGORIES = new Set(['Firefighter', 'Swing', 'Tiller', 'TADE']);

  if (window.top !== window.self || window.__mvciVectorReconciliation0211) return;
  window.__mvciVectorReconciliation0211 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();
  const uid = (...parts) => parts.map(v => clean(v).toLowerCase()).join('|');

  function loadJson(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (_) { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function state() { return loadJson(STATE_KEY, null); }
  function saveState(s) {
    if (!s) return;
    s.metadata = s.metadata || {};
    s.metadata.updatedAt = nowIso();
    s.metadata.reconciliationVersion = VERSION;
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  }
  function status() { return loadJson(STATUS_KEY, { lastRunAt: null, lastError: null, openCases: 0 }); }
  function setStatus(patch) { const next = { ...status(), ...patch }; saveJson(STATUS_KEY, next); return next; }

  function dayDiff(date, anchor = CSHIFT_ANCHOR) {
    const a = new Date(`${anchor}T12:00:00Z`), b = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }
  function isCShift(date) {
    const diff = dayDiff(date); if (diff == null) return false;
    const mod = ((diff % 6) + 6) % 6; return mod === 0 || mod === 1;
  }
  function peopleMap(s) { return new Map([...(s?.settings?.firefighters || []), ...(s?.settings?.command || [])].map(p => [p.id, p])); }
  function firefighterIds(s) { return new Set((s?.settings?.firefighters || []).map(p => p.id)); }
  function eraStart(s) { return clean(s?.settings?.ratioStartDate || s?.ratioPeriods?.find?.(p => !p.endDate)?.startDate); }

  function latestObservations(s) {
    const map = new Map();
    for (const o of (s?.observations || [])) {
      if (!o?.date || !o?.personId) continue;
      const key = `${o.date}|${o.personId}`;
      const prev = map.get(key);
      if (!prev || String(o.capturedAt || '') > String(prev.capturedAt || '')) map.set(key, o);
    }
    return map;
  }

  function legacyCreditMap(s) {
    const map = new Map();
    for (const h of (s?.history || [])) {
      if (!h?.date || !h?.personId || !CREDIT_CATEGORIES.has(h?.credit) || h?.verified === false) continue;
      map.set(`${h.date}|${h.personId}`, h);
    }
    return map;
  }

  function planMap(s) {
    const map = new Map();
    for (const p of (s?.plans || [])) {
      if (!p?.date || !p?.personId || !CREDIT_CATEGORIES.has(p?.credit)) continue;
      map.set(`${p.date}|${p.personId}`, p);
    }
    return map;
  }

  function segmentMap(s) {
    const map = new Map();
    for (const segment of (s?.segments || [])) {
      if (!segment?.date || !segment?.personId) continue;
      const key = `${segment.date}|${segment.personId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(segment);
    }
    for (const list of map.values()) list.sort((a,b) => Number(a.sequenceIndex || 0) - Number(b.sequenceIndex || 0));
    return map;
  }

  function normalizedRoleHint(hint) {
    const h = clean(hint);
    return CREDIT_CATEGORIES.has(h) ? h : null;
  }
  function planCompatible(planCredit, segments) {
    const roles = new Set(segments.map(s => normalizedRoleHint(s.roleHint)).filter(Boolean));
    if (!roles.size) return null;
    if (planCredit === 'Swing') return roles.size === 1 && (roles.has('Swing') || roles.has('Firefighter'));
    return roles.size === 1 && roles.has(planCredit);
  }
  function legacyCompatible(legacyCredit, segments) {
    const roles = new Set(segments.map(s => normalizedRoleHint(s.roleHint)).filter(Boolean));
    if (!roles.size) return null;
    if (legacyCredit === 'Swing') return roles.size === 1 && (roles.has('Swing') || roles.has('Firefighter'));
    return roles.size === 1 && roles.has(legacyCredit);
  }
  function totalHours(segments) { return segments.reduce((sum, s) => sum + (Number(s.durationHours) || 0), 0); }

  function caseRow({ date, person, issueType, summary, evidence, proposedCredit }) {
    return {
      caseKey: uid('case', date, person.id, issueType, summary),
      date,
      personId: person.id,
      personName: person.name,
      issueType,
      status: 'open',
      summary,
      evidence,
      proposedCredit: CREDIT_CATEGORIES.has(proposedCredit) ? proposedCredit : null,
      source: `Vector Scheduling ${VERSION}`,
      createdAt: nowIso(),
    };
  }

  function reconcile() {
    const s = state();
    if (!s) throw new Error('Vector Scheduling state is not available.');
    const start = eraStart(s);
    if (!start) throw new Error('Active ratio-era start date is not set.');
    const ff = firefighterIds(s), people = peopleMap(s), observations = latestObservations(s), legacy = legacyCreditMap(s), plans = planMap(s), segments = segmentMap(s);
    const dates = new Set();
    for (const key of observations.keys()) dates.add(key.split('|')[0]);
    for (const key of legacy.keys()) dates.add(key.split('|')[0]);
    for (const key of plans.keys()) dates.add(key.split('|')[0]);
    for (const key of segments.keys()) dates.add(key.split('|')[0]);

    const generated = [];
    for (const date of [...dates].filter(d => d >= start && isCShift(d)).sort()) {
      for (const personId of ff) {
        const person = people.get(personId) || { id: personId, name: personId };
        const key = `${date}|${personId}`;
        const obs = observations.get(key);
        const old = legacy.get(key);
        const plan = plans.get(key);
        const segs = (segments.get(key) || []).filter(sg => sg.verified !== false);

        if (!obs && !old && !plan && !segs.length) continue;

        if ((!obs || !obs.found) && (old || plan)) {
          generated.push(caseRow({
            date, person, issueType: 'missing',
            summary: 'Expected C-shift riding evidence is missing from the current Vector capture.',
            evidence: { legacy: old || null, plan: plan || null, observation: obs || null },
            proposedCredit: plan?.credit || old?.credit,
          }));
          continue;
        }

        if (segs.length) {
          const hours = totalHours(segs);
          const roles = [...new Set(segs.map(sg => normalizedRoleHint(sg.roleHint)).filter(Boolean))];
          const partial = segs.some(sg => Number(sg.durationHours || 0) < 23.99) || Math.abs(hours - 24) > 0.05 || segs.length > 1;
          if (partial) {
            generated.push(caseRow({
              date, person, issueType: 'partial_day',
              summary: `Vector shows precision duty segments totaling ${hours.toFixed(2)} hours; do not collapse this day to a single 24-hour actual without reconciliation.`,
              evidence: { segments: segs, legacy: old || null, plan: plan || null },
              proposedCredit: plan?.credit || old?.credit,
            }));
          }

          if (old) {
            const compatible = legacyCompatible(old.credit, segs);
            if (compatible === false) {
              generated.push(caseRow({
                date, person, issueType: 'staffing_exception',
                summary: `Vector role evidence does not cleanly match the legacy whole-shift credit ${old.credit}. Preserve the legacy credit until this is resolved.`,
                evidence: { legacy: old, segments: segs, observedRoles: roles },
                proposedCredit: old.credit,
              }));
            }
          } else if (plan) {
            const compatible = planCompatible(plan.credit, segs);
            if (compatible === false) {
              generated.push(caseRow({
                date, person, issueType: 'plan_mismatch',
                summary: `Actual Vector role evidence does not cleanly match the saved plan ${plan.credit}.`,
                evidence: { plan, segments: segs, observedRoles: roles },
                proposedCredit: plan.credit,
              }));
            }
          } else if (roles.length) {
            generated.push(caseRow({
              date, person, issueType: 'role_mapping',
              summary: 'Vector has riding evidence but there is no legacy credit or saved plan proving how this day should count, including possible Swing/FF treatment.',
              evidence: { observation: obs || null, segments: segs, observedRoles: roles },
              proposedCredit: roles.length === 1 && roles[0] !== 'Firefighter' ? roles[0] : null,
            }));
          }
        } else if (obs?.found && !old && !plan) {
          generated.push(caseRow({
            date, person, issueType: 'role_mapping',
            summary: 'Vector found the firefighter on a C-shift date but precision/plan evidence is not sufficient to assign a rotation credit automatically.',
            evidence: { observation: obs },
          }));
        }
      }
    }

    s.reconciliationCases = Array.isArray(s.reconciliationCases) ? s.reconciliationCases : [];
    const existing = new Map(s.reconciliationCases.map(c => [c.caseKey, c]));
    for (const row of generated) {
      const prior = existing.get(row.caseKey);
      if (prior && ['resolved','ignored'].includes(prior.status)) continue;
      if (prior) Object.assign(prior, { ...row, status: prior.status || 'open', createdAt: prior.createdAt || row.createdAt });
      else s.reconciliationCases.push(row);
    }
    s.metadata = s.metadata || {};
    s.metadata.lastReconciliationAt = nowIso();
    s.metadata.openReconciliationCases = s.reconciliationCases.filter(c => ['open','reviewing'].includes(c.status)).length;
    saveState(s);
    setStatus({ lastRunAt: s.metadata.lastReconciliationAt, openCases: s.metadata.openReconciliationCases, lastError: null });
    refreshCard();
    return { generated: generated.length, open: s.metadata.openReconciliationCases };
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function refreshCard() {
    const panel = document.getElementById('mvci-vs-panel'); if (!panel) return;
    let card = panel.querySelector(`#${CARD_ID}`);
    if (!card) { card = document.createElement('div'); card.id = CARD_ID; card.className = 'vs-card'; panel.appendChild(card); }
    const s = state(), cases = Array.isArray(s?.reconciliationCases) ? s.reconciliationCases : [], open = cases.filter(c => ['open','reviewing'].includes(c.status));
    const st = status();
    card.innerHTML = `<h3>Reconciliation Ready Room <span class="vs-muted">${VERSION}</span></h3>
      <div class="vs-muted" style="margin-bottom:7px">${open.length} open exception(s). Raw evidence never becomes riding credit automatically.</div>
      ${open.slice(0,5).map(c=>`<div style="border-top:1px solid #e2e7ed;padding:5px 0"><b>${esc(c.date)} · ${esc(c.personName)}</b><div class="vs-muted">${esc(c.issueType)} · ${esc(c.summary)}</div></div>`).join('')}
      <button id="vs-reconcile-run-v0211" class="vs-btn secondary" style="margin-top:7px">Reconcile local evidence</button>
      <div class="vs-muted" style="margin-top:7px">Cases are transported by the unified Mission Vector Bridge; this module performs no network writes.</div>
      ${st.lastError ? `<div class="vs-muted" style="margin-top:5px">Last error: ${esc(st.lastError)}</div>` : ''}`;
    const btn = card.querySelector('#vs-reconcile-run-v0211');
    if (btn) btn.onclick = () => {
      try { const r = reconcile(); alert(`Local reconciliation complete.\n\n${r.open} unresolved case(s) remain.`); }
      catch (error) { setStatus({ lastError: clean(error?.message || error) }); refreshCard(); alert(`Reconciliation failed.\n\n${error?.message || error}`); }
    };
  }

  setInterval(refreshCard, 1800);
  setInterval(() => { try { reconcile(); } catch (_) {} }, 30000);
  setTimeout(() => { try { reconcile(); } catch (_) { refreshCard(); } }, 4000);

  const api = { version: VERSION, reconcile };
  window.MVCI_VECTOR_RECONCILIATION_0211 = api;
  window.MVCI_VECTOR_RECONCILIATION_0150 = api;
})();