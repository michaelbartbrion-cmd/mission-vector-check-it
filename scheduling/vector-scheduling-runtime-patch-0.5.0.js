(function () {
  'use strict';

  const PATCH_VERSION = '0.5.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const Engine = window.VectorSchedulingEngine;
  if (!Engine || window.__mvciVectorSchedulingPatch050) return;
  window.__mvciVectorSchedulingPatch050 = { version: PATCH_VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const uid = (...parts) => parts.map(v => clean(v).toLowerCase()).join('|');

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function saveState(state) {
    if (!state) return;
    state.metadata = state.metadata || {};
    state.metadata.updatedAt = new Date().toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }
  function upsert(list, row, keyFn) {
    const k = keyFn(row), i = list.findIndex(x => keyFn(x) === k);
    if (i >= 0) list[i] = row; else list.push(row);
  }
  function people(state) { return [...(state?.settings?.firefighters || []), ...(state?.settings?.command || [])]; }

  function pageDocuments() {
    const out = [], seen = new Set();
    function walk(doc) {
      if (!doc || seen.has(doc)) return;
      seen.add(doc); out.push(doc);
      let frames = [];
      try { frames = [...doc.querySelectorAll('iframe,frame')]; } catch (_) { return; }
      for (const frame of frames) {
        try { if (frame.contentDocument) walk(frame.contentDocument); } catch (_) { /* cross-origin frame */ }
      }
    }
    walk(document);
    return out;
  }

  function parseDateCandidate(value) {
    const t = clean(value);
    if (!t) return null;
    const direct = Engine.parseDateFromText(t);
    if (direct) return direct;
    let m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    if (m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    const named = t.match(/\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)?,?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
    if (named) {
      const d = new Date(`${named[1]} ${named[2]}, ${named[3]} 12:00:00`);
      if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    return null;
  }

  function displayedDate() {
    const docs = pageDocuments();
    for (const doc of docs) {
      const d = parseDateCandidate(clean(doc.body?.innerText || ''));
      if (d) return d;
    }
    const selectors = 'time,[datetime],[data-date],[data-day],[data-current-date],input[type=date],[aria-label],[title],h1,h2,h3,.date,.day-date,.schedule-date,.datepicker';
    const candidates = [];
    for (const doc of docs) {
      let els = [];
      try { els = [...doc.querySelectorAll(selectors)]; } catch (_) { continue; }
      for (const el of els) {
        const vals = [el.getAttribute?.('datetime'), el.getAttribute?.('data-date'), el.getAttribute?.('data-day'), el.getAttribute?.('data-current-date'), el.value, el.getAttribute?.('aria-label'), el.getAttribute?.('title'), el.innerText, el.textContent];
        for (const v of vals) {
          const d = parseDateCandidate(v);
          if (!d) continue;
          let score = 0;
          const tag = (el.tagName || '').toLowerCase();
          if (/^h[1-3]$/.test(tag)) score += 6;
          if (tag === 'time') score += 5;
          if (el.matches?.('[data-current-date],input[type=date]')) score += 7;
          if (/date|day|schedule/.test(clean(el.className || '').toLowerCase())) score += 4;
          try { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) score += 3; } catch (_) {}
          candidates.push({ d, score });
        }
      }
    }
    if (candidates.length) {
      candidates.sort((a,b) => b.score - a.score);
      return candidates[0].d;
    }
    try {
      const u = new URL(location.href);
      for (const key of ['date','day','start','startDate','selectedDate']) {
        const d = parseDateCandidate(u.searchParams.get(key));
        if (d) return d;
      }
    } catch (_) {}
    return null;
  }

  function pageMeta() {
    const href = String(location.href || '').toLowerCase();
    const text = pageDocuments().map(d => clean(d.body?.innerText || '')).join(' ');
    return {
      viewType: /listview/.test(href) ? 'ListView' : /schedule/.test(href) ? 'Schedule' : 'Unknown',
      pageLocked: /\bLOCKED\b|locked based on your permissions/i.test(text)
    };
  }

  function bestPersonContainer(name) {
    const needle = clean(name).toLowerCase();
    let best = null, bestScore = -Infinity;
    for (const doc of pageDocuments()) {
      let nodes = [];
      try {
        nodes = [...doc.querySelectorAll('body *')].filter(el => {
          const t = clean(el.textContent || '').toLowerCase();
          return t.includes(needle) && t.length < 1800;
        });
      } catch (_) { continue; }
      for (const start of nodes) {
        let el = start;
        for (let depth = 0; el && depth < 8; depth++, el = el.parentElement) {
          const t = clean(el.innerText || '');
          if (!t.toLowerCase().includes(needle) || t.length > 1800) continue;
          let score = 0;
          if (el.matches?.('tr,li,[role=row],.row,.list-group-item')) score += 8;
          for (const k of ['Truck','Engine','Medic','Deployment','Training','Vacation','Holiday','Sick','Leave','FFB','TM','DE-A','Capt','TAC','TADE','Swing']) {
            if (new RegExp(`\\b${k}\\b`, 'i').test(t)) score += 1;
          }
          score -= t.length / 500;
          if (score > bestScore) { bestScore = score; best = el; }
        }
      }
    }
    return best;
  }

  function latestObservation(state, date, personId) {
    return (state.observations || []).filter(o => o.date === date && o.personId === personId)
      .sort((a,b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')))[0] || null;
  }
  function currentPlan(state, date, personId) {
    return (state.plans || []).find(p => p.date === date && p.personId === personId) || null;
  }

  function reconcile(state, date) {
    state.reviews = state.reviews || [];
    state.history = state.history || [];
    const apparatusName = state?.settings?.apparatusName || 'Truck 504';
    for (const p of (state?.settings?.firefighters || [])) {
      const o = latestObservation(state, date, p.id);
      if (!o) continue;
      const pl = currentPlan(state, date, p.id);
      const r = Engine.reconcileFirefighter({ planCredit: pl?.credit || null, observation: o, apparatusName });
      upsert(state.reviews, {
        date, personId:p.id, observationCapturedAt:o.capturedAt, planCredit:pl?.credit || null,
        status:r.status, detail:r.detail, credit:r.credit, reason:r.reason, source:'runtime-patch-0.5.0'
      }, x => uid(x.date,x.personId,x.observationCapturedAt));
      if (['verified','inferred'].includes(r.status) && r.credit) {
        upsert(state.history, {
          date, personId:p.id, detail:r.detail, credit:r.credit, verified:true,
          source:'vector-reconciled', observedAt:o.capturedAt, planCredit:pl?.credit || null
        }, x => uid(x.date,x.personId));
      }
    }
  }

  function robustCapture() {
    const state = loadState();
    if (!state) return alert('Vector Scheduling state was not found. Import the private Truck 504 JSON first.');
    const crew = people(state);
    if (!crew.length) return alert('Import the private Truck 504 JSON first.');
    const date = displayedDate();
    if (!date) return alert('Still could not determine the displayed date. Use ListView and try again; this build now scans same-origin frames, date controls, attributes, and URL date values.');

    state.observations = state.observations || [];
    const capturedAt = new Date().toISOString();
    const meta = pageMeta();
    let found = 0;
    for (const p of crew) {
      const el = bestPersonContainer(p.name);
      const rawText = clean(el?.innerText || '');
      if (el) found++;
      const row = {
        date, personId:p.id, personName:p.name, capturedAt, rawText,
        dutyCode:Engine.detectDutyCode(rawText), assignment:Engine.detectAssignment(rawText), found:!!el,
        source:'vector-dom-readonly', viewType:meta.viewType, pageLocked:meta.pageLocked
      };
      upsert(state.observations, row, x => uid(x.date,x.personId,x.capturedAt,x.source));
    }
    state.metadata = state.metadata || {};
    state.metadata.lastCaptureAt = capturedAt;
    state.metadata.lastCaptureView = meta.viewType;
    state.metadata.lastCaptureLocked = meta.pageLocked;
    reconcile(state, date);
    saveState(state);
    alert(`Captured ${found}/${crew.length} tracked people for ${date} from ${meta.viewType}${meta.pageLocked ? ' (LOCKED historical schedule view)' : ''}.`);
  }

  function preciseExposure(state, personId) {
    const cats = Engine.CREDIT_CATEGORIES || ['Firefighter','Swing','Tiller','TADE'];
    const history = (state.history || []).filter(h => h.personId === personId && h.credit && h.verified !== false);
    const counts = Object.fromEntries(cats.map(c => [c,0]));
    for (const h of history) if (cats.includes(h.credit)) counts[h.credit] += 1;
    let integratedHours = 0, pendingHours = 0;
    const shiftHours = Number(state?.settings?.shiftLengthHours || 24);
    for (const seg of (state.segments || []).filter(s => s.personId === personId && s.verified !== false && cats.includes(s.role))) {
      const hrs = Math.max(0, Math.min(shiftHours, Number(seg.durationHours || 0)));
      if (!hrs) continue;
      const base = history.find(h => h.date === seg.date);
      if (!base || !cats.includes(base.credit)) { pendingHours += hrs; continue; }
      const frac = hrs / shiftHours;
      if (base.credit !== seg.role) {
        counts[base.credit] = Math.max(0, counts[base.credit] - frac);
        counts[seg.role] += frac;
      }
      integratedHours += hrs;
    }
    const total = Object.values(counts).reduce((a,b) => a+b, 0);
    const ratios = Object.fromEntries(cats.map(c => [c, total ? counts[c]/total : 0]));
    return { counts, ratios, total, integratedHours, pendingHours };
  }

  function patchPrecisionCard() {
    const panel = document.getElementById('mvci-vs-panel');
    if (!panel) return;
    const state = loadState();
    if (!state?.settings?.firefighters?.length) return;
    const heading = [...panel.querySelectorAll('h3')].find(h => /Temporary TADE due order/i.test(h.textContent || ''));
    if (!heading) return;
    const card = heading.closest('.vs-card');
    if (!card || card.dataset.precisionPatched === PATCH_VERSION) return;
    const rows = state.settings.firefighters.map(p => ({ p, e:preciseExposure(state,p.id) }))
      .sort((a,b) => a.e.ratios.TADE - b.e.ratios.TADE || a.p.name.localeCompare(b.p.name));
    card.dataset.precisionPatched = PATCH_VERSION;
    card.innerHTML = `<h3>Precise TADE due order</h3>${rows.map((x,i)=>`<div>${i+1}. <strong>${x.p.name}</strong> — TADE ${(x.e.ratios.TADE*100).toFixed(2)}% (${x.e.counts.TADE.toFixed(3)} shift-equivalents)${x.e.pendingHours?` · ${x.e.pendingHours.toFixed(1)} hr pending base-role reconciliation`:''}</div>`).join('')}<div class="vs-muted" style="margin-top:5px">Partial-day coverage counts proportionally once the base role for that day is known. Example: 5 hours of TADE replaces 5/24 of that day's base seat with TADE exposure. This precision ledger is separate from the preference to keep the same riding seats for both consecutive shifts.</div>`;
  }

  function wire() {
    const captureButton = document.getElementById('d-capture');
    if (captureButton && captureButton.dataset.patch050 !== '1') {
      captureButton.dataset.patch050 = '1';
      captureButton.onclick = robustCapture;
      captureButton.title = 'Robust read-only capture (v0.5 frame/date/lock aware)';
    }
    patchPrecisionCard();
  }

  const observer = new MutationObserver(wire);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  setInterval(wire, 1200);
  wire();

  window.VectorSchedulingRuntimePatch = { version:PATCH_VERSION, robustCapture, displayedDate, pageMeta, preciseExposure };
})();
