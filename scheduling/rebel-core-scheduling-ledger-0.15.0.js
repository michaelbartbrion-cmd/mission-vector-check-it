(function () {
  'use strict';

  const VERSION = '0.15.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const CONFIG_KEY = 'missionVectorRebelCorePairing_v1';
  const SENT_KEY = 'missionVectorRebelCoreLedgerSent_v1';
  const STATUS_KEY = 'missionVectorRebelCoreLedgerStatus_v1';
  const CSHIFT_ANCHOR = '2026-09-10';
  const CREDIT_CATEGORIES = new Set(['Firefighter', 'Swing', 'Tiller', 'TADE']);
  const MAX_BATCH = 50;

  if (window.top !== window.self || window.__mvciRebelCoreLedger0150) return;
  window.__mvciRebelCoreLedger0150 = { version: VERSION, startedAt: Date.now() };

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

  function state() {
    return loadJson(STATE_KEY, null);
  }

  function pairing() {
    const cfg = loadJson(CONFIG_KEY, null);
    if (!cfg?.endpoint || !cfg?.token || !/^https:\/\//i.test(cfg.endpoint)) return null;
    return cfg;
  }

  function status() {
    return loadJson(STATUS_KEY, { lastAttemptAt: null, lastSuccessAt: null, lastError: null, creditsSent: 0, plansSent: 0 });
  }

  function setStatus(patch) {
    const next = { ...status(), ...patch };
    saveJson(STATUS_KEY, next);
    return next;
  }

  function sentState() {
    const s = loadJson(SENT_KEY, { credits: {}, plans: {} });
    if (!s.credits) s.credits = {};
    if (!s.plans) s.plans = {};
    return s;
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
      throw new Error(message || `HTTP ${response.status}`);
    }
    return body;
  }

  function dayDiff(date, anchor = CSHIFT_ANCHOR) {
    const a = new Date(`${anchor}T12:00:00Z`);
    const b = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }

  function isCShift(date) {
    const diff = dayDiff(date);
    if (diff == null) return false;
    const mod = ((diff % 6) + 6) % 6;
    return mod === 0 || mod === 1;
  }

  function currentEraStart(s) {
    return clean(s?.settings?.ratioStartDate || s?.ratioPeriods?.find?.(p => !p.endDate)?.startDate);
  }

  function personMap(s) {
    return new Map([...(s?.settings?.firefighters || []), ...(s?.settings?.command || [])].map(p => [p.id, p]));
  }

  function firefighterIds(s) {
    return new Set((s?.settings?.firefighters || []).map(p => p.id));
  }

  function creditRows(s) {
    const start = currentEraStart(s);
    const ff = firefighterIds(s);
    const people = personMap(s);
    if (!start) return [];
    return (s?.history || [])
      .filter(h => h?.verified !== false && h?.date >= start && ff.has(h?.personId) && CREDIT_CATEGORIES.has(h?.credit) && isCShift(h.date))
      .map(h => {
        const p = people.get(h.personId);
        const key = `legacy:${h.date}:${h.personId}:${h.credit}:${clean(h.detail || h.credit)}`;
        return {
          localKey: key,
          revision: JSON.stringify([h.date, h.personId, h.credit, h.detail, h.verified, h.source]),
          event: {
            kind: 'riding_credit',
            credit_key: key,
            ratio_era_key: `ratio-era:${start}`,
            person_key: h.personId,
            person_name: p?.name || h.personId,
            credit_date: h.date,
            credit_category: h.credit,
            credit_value: 1,
            hours: Number(s?.settings?.shiftLengthHours || 24),
            source_type: 'legacy',
            source_key: clean(h.source || 'legacy-spreadsheet-manual'),
            verified: true,
            notes: `Imported verified whole-shift credit: ${clean(h.detail || h.credit)}.`,
            resolved_at: nowIso(),
          },
        };
      });
  }

  function planRows(s) {
    const people = personMap(s);
    return (s?.plans || [])
      .filter(p => p?.date && p?.personId && CREDIT_CATEGORIES.has(p?.credit))
      .map(p => {
        const key = `plan:${p.date}:${p.personId}`;
        return {
          localKey: key,
          revision: JSON.stringify([p.date, p.personId, p.credit, p.scenario, p.blockStartDate, p.createdAt, p.source, p.supersededAt]),
          event: {
            kind: 'scheduling_plan',
            plan_key: key,
            block_start_date: p.blockStartDate || p.date,
            shift_date: p.date,
            person_key: p.personId,
            person_name: people.get(p.personId)?.name || p.personId,
            planned_credit: p.credit,
            expected_assignment_group: p.expectedAssignmentGroup || 'Truck 504',
            scenario: clean(p.scenario),
            status: p.supersededAt ? 'superseded' : 'active',
            source: clean(p.source || 'Vector Scheduling planner'),
            created_at: p.createdAt || nowIso(),
            superseded_at: p.supersededAt,
            notes: clean(p.note || p.notes),
          },
        };
      });
  }

  async function sendRows(rows, sentMap) {
    const pending = rows.filter(r => sentMap[r.localKey] !== r.revision);
    let count = 0;
    for (let i = 0; i < pending.length; i += MAX_BATCH) {
      const batch = pending.slice(i, i + MAX_BATCH);
      const result = await post(batch.map(r => r.event));
      if (Number(result?.failed || 0) > 0) throw new Error(`Rebel Core rejected ${result.failed} scheduling-ledger record(s).`);
      for (const row of batch) sentMap[row.localKey] = row.revision;
      count += batch.length;
      saveJson(SENT_KEY, sentStateCache);
    }
    return count;
  }

  let sentStateCache = sentState();

  async function syncLedger() {
    if (!pairing()) {
      refreshCard();
      return { paired: false, credits: 0, plans: 0 };
    }
    const s = state();
    if (!s) throw new Error('Vector Scheduling state is not available.');
    sentStateCache = sentState();
    try {
      const credits = await sendRows(creditRows(s), sentStateCache.credits);
      const plans = await sendRows(planRows(s), sentStateCache.plans);
      saveJson(SENT_KEY, sentStateCache);
      const prior = status();
      setStatus({
        lastSuccessAt: nowIso(),
        lastError: null,
        creditsSent: Number(prior.creditsSent || 0) + credits,
        plansSent: Number(prior.plansSent || 0) + plans,
      });
      refreshCard();
      return { paired: true, credits, plans };
    } catch (error) {
      setStatus({ lastError: clean(error?.message || error) });
      refreshCard();
      throw error;
    }
  }

  function pendingCounts() {
    const s = state();
    if (!s) return { credits: 0, plans: 0, totalCredits: 0, totalPlans: 0 };
    const sent = sentState();
    const credits = creditRows(s);
    const plans = planRows(s);
    return {
      totalCredits: credits.length,
      totalPlans: plans.length,
      credits: credits.filter(r => sent.credits[r.localKey] !== r.revision).length,
      plans: plans.filter(r => sent.plans[r.localKey] !== r.revision).length,
    };
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function refreshCard() {
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;
    let card = panel.querySelector('#vs-rebel-core-ledger-v0150');
    if (!card) {
      card = document.createElement('div');
      card.id = 'vs-rebel-core-ledger-v0150';
      card.className = 'vs-card';
      const segments = panel.querySelector('#vs-rebel-core-segments-v0150');
      if (segments) segments.insertAdjacentElement('afterend', card);
      else panel.appendChild(card);
    }
    const c = pendingCounts();
    const st = status();
    const paired = !!pairing();
    const health = st.lastError ? `Error: ${esc(st.lastError)}` : st.lastSuccessAt ? `Last sync ${new Date(st.lastSuccessAt).toLocaleString()}` : 'Not synced yet';
    card.innerHTML = `<h3>Scheduling ledger sync <span class="vs-muted">${VERSION}</span></h3><div class="vs-muted" style="margin-bottom:7px">${c.totalCredits} verified current-era credits · ${c.totalPlans} saved plan rows</div><div class="vs-muted" style="margin-bottom:7px">Pending: ${c.credits} credits · ${c.plans} plans</div>${paired ? `<div style="margin-bottom:7px">${health}</div><button id="vs-rebel-core-ledger-sync-v0150" class="vs-btn secondary">Sync scheduling ledger</button>` : '<div class="vs-muted">Pair Rebel Core above to enable ledger sync.</div>'}`;
    const btn = card.querySelector('#vs-rebel-core-ledger-sync-v0150');
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await syncLedger();
        alert(`Rebel Core scheduling ledger sync complete.\n\n${r.credits || 0} credit row(s) and ${r.plans || 0} plan row(s) sent.`);
      } catch (error) {
        alert(`Scheduling ledger sync failed.\n\n${error?.message || error}`);
      } finally {
        btn.disabled = false;
      }
    };
  }

  setInterval(refreshCard, 1800);
  setInterval(() => { if (pairing()) syncLedger().catch(() => {}); }, 180000);
  setTimeout(refreshCard, 700);
  setTimeout(() => { if (pairing()) syncLedger().catch(() => {}); }, 12000);

  window.MVCI_REBEL_CORE_LEDGER_0150 = { version: VERSION, syncLedger, pendingCounts };
})();
