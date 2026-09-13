(function () {
  'use strict';

  const VERSION = '0.18.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const RUN_KEY = 'missionVectorScheduling_offshiftArchive_v0180';
  const RATIO_RUN_KEY = 'missionVectorScheduling_backfill_v0130';
  const PAIRING_KEY = 'missionVectorRebelCorePairing_v1';
  const ANCHOR_DAY1 = '2026-09-10';
  const ANCHOR_DAY2 = '2026-09-11';
  const TIME_RANGE_RE = /\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/;

  if (window.top !== window.self || window.__mvciOffshiftArchive0180) return;
  window.__mvciOffshiftArchive0180 = { version: VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function loadJson(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function saveJson(key, value) {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  }
  function loadState() { return loadJson(STATE_KEY, null); }
  function saveState(state) {
    if (!state) return;
    state.metadata = state.metadata || {};
    state.metadata.updatedAt = new Date().toISOString();
    state.metadata.offshiftArchiveVersion = VERSION;
    saveJson(STATE_KEY, state);
  }
  function loadRun() { return loadJson(RUN_KEY, null); }
  function saveRun(run) { saveJson(RUN_KEY, run); }
  function pairing() { const p = loadJson(PAIRING_KEY, null); return p?.endpoint && p?.token ? p : null; }
  function reader() {
    const r = window.MVCI_VECTOR_READER_0120;
    if (!r?.captureNow) throw new Error('Vector Scheduling reader is not loaded. Refresh ListView and try again.');
    return r;
  }
  function parseDate(date) { const d = new Date(`${date}T12:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
  function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function addDays(date, n) { const d = parseDate(date); if (!d) return null; d.setDate(d.getDate()+n); return fmt(d); }
  function priorDate(date) { return addDays(date, -1); }
  function dateToHash(date) { const [y,m,d] = date.split('-'); return `#${y}/${m}/${d}`; }
  function dayDiff(a, b) { const A=parseDate(a), B=parseDate(b); return A&&B ? Math.round((A-B)/86400000) : null; }
  function mod(n,m) { return ((n % m) + m) % m; }
  function isCShiftDate(date) { const diff=dayDiff(date, ANCHOR_DAY1); if (diff == null) return false; const phase=mod(diff,6); return phase===0 || phase===1; }
  function isOffShiftDate(date) { return !!date && !isCShiftDate(date); }
  function previousOffShiftDate(date) {
    let d = priorDate(date);
    for (let i=0; d && i<6; i++) { if (isOffShiftDate(d)) return d; d = priorDate(d); }
    return null;
  }
  function countEligible(start, end) {
    let count=0, d=end;
    while (d && d>=start) { if (isOffShiftDate(d)) count++; d=priorDate(d); }
    return count;
  }
  function trackedIds(state) {
    return new Set([...(state?.settings?.firefighters||[]), ...(state?.settings?.command||[])].map(p=>p.id));
  }

  async function waitForVisibleDate(target, timeout=15000) {
    const started=Date.now(); let consecutive=0;
    while (Date.now()-started<timeout) {
      await sleep(250);
      const visible=reader().visibleDisplayedDate?.();
      if (visible===target) { consecutive++; if (consecutive>=2) return true; }
      else consecutive=0;
    }
    return false;
  }

  function findPreviousControl() {
    const candidates=[];
    for (const doc of reader().pageDocuments?.() || [document]) {
      let els=[]; try { els=[...doc.querySelectorAll('button,a,[role="button"]')]; } catch (_) { continue; }
      for (const el of els) {
        if (el.closest?.('#mvci-vs-panel,#mvci-vs-open')) continue;
        const label=clean(`${el.getAttribute?.('aria-label')||''} ${el.getAttribute?.('title')||''} ${el.textContent||''}`).toLowerCase();
        if (/previous\s*(day|date)?|prev\s*(day|date)?|prior\s*(day|date)?/.test(label)) candidates.push({el,score:100});
        else if (/(^|\s)(‹|«|←|◀)(\s|$)/.test(label)) candidates.push({el,score:20});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0]?.el || null;
  }

  async function navigateToDate(target, current) {
    if (/\/ListView\/?$/i.test(location.pathname) || /\/ListView\//i.test(location.pathname)) {
      location.hash = dateToHash(target);
      if (await waitForVisibleDate(target, 15000)) { await sleep(400); return target; }
    }
    if (target===priorDate(current)) {
      const prev=findPreviousControl();
      if (prev) { prev.click(); if (await waitForVisibleDate(target,15000)) { await sleep(400); return target; } }
    }
    throw new Error(`Could not navigate from ${current} to ${target}.`);
  }

  function compactOffshiftCapture(state, date, capturedAt) {
    const ids=trackedIds(state);
    const keep=[];
    const latest=new Map();
    let removedMissing=0;
    for (const o of state.observations || []) {
      const ours = o.date===date && ids.has(o.personId) && String(o.source||'').startsWith('vector-dom-readonly');
      if (!ours) { keep.push(o); continue; }
      const operational = Boolean(o.found && TIME_RANGE_RE.test(clean(o.rawText)));
      if (!operational) { removedMissing++; continue; }
      const prev=latest.get(o.personId);
      if (!prev || String(o.capturedAt||'') > String(prev.capturedAt||'')) latest.set(o.personId,o);
    }
    for (const o of latest.values()) keep.push(o);
    state.observations=keep;
    const segmentRows=(state.segments||[]).filter(s=>s.date===date && ids.has(s.personId) && s.capturedAt===capturedAt);
    return { summaryRows: latest.size, segmentRows: segmentRows.length, removedMissing };
  }

  function ensureArchiveRecord(state, run) {
    state.activityArchiveRuns=Array.isArray(state.activityArchiveRuns)?state.activityArchiveRuns:[];
    let rec=state.activityArchiveRuns.find(x=>x.id===run.id);
    if (!rec) { rec={id:run.id,startedAt:run.startedAt,startDate:run.startDate,startingDate:run.startingDate}; state.activityArchiveRuns.push(rec); }
    return rec;
  }

  function persistRun(run) {
    run.updatedAt=new Date().toISOString(); saveRun(run);
    const state=loadState(); if (!state) return;
    const rec=ensureArchiveRecord(state,run);
    Object.assign(rec,{
      status:run.status,captures:run.captures||0,activityDates:run.activityDates||0,
      summaryRows:run.summaryRows||0,segmentRows:run.segmentRows||0,lastCapturedDate:run.lastCapturedDate||null,
      updatedAt:run.updatedAt,error:run.error||null,completedAt:run.completedAt||null,stoppedAt:run.stoppedAt||null,
      scope:'off-shift-only',anchorDay1:ANCHOR_DAY1,anchorDay2:ANCHOR_DAY2,
    });
    state.metadata=state.metadata||{};
    state.metadata.lastOffshiftArchiveStatus=run.status;
    state.metadata.lastOffshiftArchiveDate=run.lastCapturedDate||null;
    state.metadata.lastOffshiftArchiveCaptures=run.captures||0;
    state.metadata.lastOffshiftArchiveActivityDates=run.activityDates||0;
    state.metadata.lastOffshiftArchiveSegments=run.segmentRows||0;
    state.metadata.lastOffshiftArchiveError=run.error||null;
    saveState(state);
  }

  function captureCurrent() {
    const out=reader().captureNow();
    const state=loadState();
    if (!state) throw new Error('Scheduling state disappeared during activity archive.');
    const compact=compactOffshiftCapture(state,out.date,out.capturedAt);
    saveState(state);
    return { ...out, compact };
  }

  function maybeKickSync(run) {
    if (!pairing() || (run.captures||0)%10!==0) return;
    try { window.MVCI_REBEL_CORE_TELEMETRY_0140?.syncNow?.({ forceActivities:false })?.catch?.(()=>{}); } catch (_) {}
    try { window.MVCI_REBEL_CORE_SEGMENTS_0150?.syncSegments?.()?.catch?.(()=>{}); } catch (_) {}
  }

  async function runArchive() {
    let run=loadRun();
    if (!run?.active || window.__mvciOffshiftArchiveLoop0180) return;
    window.__mvciOffshiftArchiveLoop0180=true;
    try {
      if (reader().pageMode?.()!=='ListView') throw new Error('Open Vector ListView before running the off-shift activity archive.');
      while ((run=loadRun())?.active) {
        const ratioRun=loadJson(RATIO_RUN_KEY,null);
        if (ratioRun?.active) throw new Error('Ratio backfill is running. Stop it before the off-shift archive.');
        const visible=reader().visibleDisplayedDate?.();
        const date=visible || reader().displayedDate?.();
        if (!date) throw new Error('Could not determine the visibly displayed Vector date.');
        if (date<run.startDate) {
          run.active=false; run.status='complete'; run.completedAt=new Date().toISOString(); persistRun(run); refreshUI(); break;
        }
        if (isCShiftDate(date)) {
          const target=previousOffShiftDate(date);
          if (!target || target<run.startDate) { run.active=false; run.status='complete'; run.completedAt=new Date().toISOString(); persistRun(run); refreshUI(); break; }
          await navigateToDate(target,date); continue;
        }
        const out=captureCurrent();
        if (out.date!==date) throw new Error(`Reader/date mismatch: visible ${date}, capture ${out.date}. Archive stopped rather than mis-date evidence.`);
        run.captures=(run.captures||0)+1;
        run.lastCapturedDate=date;
        run.summaryRows=(run.summaryRows||0)+Number(out.compact?.summaryRows||0);
        run.segmentRows=(run.segmentRows||0)+Number(out.compact?.segmentRows||0);
        if (Number(out.compact?.summaryRows||0)>0 || Number(out.compact?.segmentRows||0)>0) run.activityDates=(run.activityDates||0)+1;
        run.status='running'; persistRun(run); refreshUI(); maybeKickSync(run);
        const target=previousOffShiftDate(date);
        if (!target || target<run.startDate) {
          run.active=false; run.status='complete'; run.completedAt=new Date().toISOString(); persistRun(run); refreshUI();
          alert(`Off-shift activity archive complete.\n\nScanned ${run.captures} scheduled off-days through ${date}.\nFound operational activity on ${run.activityDates||0} date(s) with ${run.segmentRows||0} precision segment(s).\n\nThese records are informational only and do not affect C-shift riding ratios.`);
          break;
        }
        await navigateToDate(target,date);
      }
    } catch (error) {
      run=loadRun()||{id:`offshift-error-${Date.now()}`,captures:0};
      run.active=false; run.status='stopped-error'; run.error=String(error?.message||error); run.stoppedAt=new Date().toISOString(); persistRun(run); refreshUI();
      alert(`Off-shift activity archive stopped safely.\n\n${run.error}\n\nNo Vector data was changed.`);
    } finally {
      window.__mvciOffshiftArchiveLoop0180=false; refreshUI();
    }
  }

  function defaultStartDate(state) {
    return state?.settings?.offShiftArchiveStartDate || state?.settings?.ratioStartDate || state?.ratioPeriods?.find?.(p=>!p.endDate)?.startDate || '';
  }

  function startArchive() {
    const state=loadState(); if (!state) throw new Error('Scheduling state has not been initialized.');
    if (loadJson(RATIO_RUN_KEY,null)?.active) throw new Error('Stop the ratio backfill before starting the off-shift archive.');
    if (reader().pageMode?.()!=='ListView') throw new Error('Open Vector ListView first.');
    const start=defaultStartDate(state); if (!start) throw new Error('No archive start date is configured.');
    const current=reader().visibleDisplayedDate?.() || reader().displayedDate?.(); if (!current) throw new Error('Could not determine the displayed Vector date.');
    if (current<start) throw new Error(`Displayed date ${current} is before archive start ${start}.`);
    const expected=countEligible(start,current);
    const pairedText=pairing()?'Rebel Core is paired; data will sync as the archive runs.':'Rebel Core is not paired yet; factual records will remain local until pairing/sync.';
    if (!confirm(`Archive tracked crew activity outside C Shift from ${current} backward through ${start}?\n\n${expected} scheduled off-days will be checked.\n${pairedText}\n\nThis is READ-ONLY against Vector and never changes riding ratios.`)) return;
    state.settings=state.settings||{}; state.settings.offShiftArchiveStartDate=start; saveState(state);
    const run={id:`offshift-${Date.now()}`,active:true,status:'running',startedAt:new Date().toISOString(),startDate:start,startingDate:current,expectedDates:expected,captures:0,activityDates:0,summaryRows:0,segmentRows:0,error:null};
    persistRun(run); refreshUI(); setTimeout(runArchive,150);
  }

  function stopArchive() {
    const run=loadRun(); if (!run) return;
    run.active=false; run.status='stopped-user'; run.stoppedAt=new Date().toISOString(); persistRun(run); refreshUI();
  }

  function refreshUI() {
    const panel=document.getElementById('mvci-vs-panel'); if (!panel) return;
    const state=loadState(); if (!state) return;
    let card=panel.querySelector('#vs-offshift-archive-v0180');
    if (!card) {
      card=document.createElement('div'); card.id='vs-offshift-archive-v0180'; card.className='vs-card';
      const backfill=panel.querySelector('#vs-backfill-card-v0130');
      if (backfill) backfill.insertAdjacentElement('afterend',card); else panel.appendChild(card);
    }
    const run=loadRun();
    const start=defaultStartDate(state)||'not set';
    const current=reader().visibleDisplayedDate?.() || reader().displayedDate?.() || 'unknown';
    const expected=start!=='not set'&&current!=='unknown'?countEligible(start,current):0;
    const progress=run?.active
      ? `Running · ${run.lastCapturedDate||current} · ${run.captures||0}/${run.expectedDates||'?'} off-days checked · ${run.activityDates||0} with activity`
      : run?.status==='complete'
        ? `Complete · ${run.captures||0} off-days · ${run.activityDates||0} with activity · ${run.segmentRows||0} segments`
        : run?.error ? `Stopped: ${run.error}` : 'Not run yet';
    card.innerHTML=`<h3>Off-shift activity archive <span class="vs-muted">${VERSION}</span></h3><div class="vs-muted" style="margin-bottom:7px">Tracks overtime, subs, training, deployments and other work outside C Shift. Informational only; never changes riding ratios.</div><div class="vs-muted" style="margin-bottom:7px">Archive start ${esc(start)} · displayed ${esc(current)} · ${expected} scheduled off-days in current range</div><div style="margin-bottom:8px">${esc(progress)}</div><div style="display:flex;gap:6px"><button id="vs-offshift-start-v0180" class="vs-btn secondary" style="flex:1" ${run?.active?'disabled':''}>Archive off-shift activity</button><button id="vs-offshift-stop-v0180" class="vs-btn secondary" style="flex:0 0 90px" ${run?.active?'':'disabled'}>Stop</button></div><div class="vs-muted" style="margin-top:7px">C-shift staffing/seat accounting stays in the ratio backfill above. This pass checks only the four scheduled off-days in each six-day cycle.</div>`;
    card.querySelector('#vs-offshift-start-v0180')?.addEventListener('click',()=>{try{startArchive();}catch(e){alert(e.message||e);}});
    card.querySelector('#vs-offshift-stop-v0180')?.addEventListener('click',stopArchive);
  }

  setInterval(refreshUI,1500);
  setTimeout(refreshUI,700);
  if (loadRun()?.active) setTimeout(runArchive,1200);
  window.MVCI_VECTOR_OFFSHIFT_ARCHIVE_0180={version:VERSION,startArchive,stopArchive,runArchive,isCShiftDate,isOffShiftDate,previousOffShiftDate,countEligible};
})();
