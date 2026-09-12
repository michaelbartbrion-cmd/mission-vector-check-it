(function () {
  'use strict';

  const PATCH_VERSION = '0.11.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const RUN_KEY = 'missionVectorScheduling_backfill_v0110';

  // The scheduler UI and state controller must run only in the top page.
  // The reader can still inspect same-origin frames from here.
  if (window.top !== window.self) return;
  if (window.__mvciVectorSchedulingPatch0110) return;
  window.__mvciVectorSchedulingPatch0110 = { version: PATCH_VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const MONTHS = {jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};

  function loadState(){ try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(_){return null;} }
  function saveState(s){
    if(!s)return;
    s.metadata=s.metadata||{};
    s.metadata.runtimeVersion=PATCH_VERSION;
    s.metadata.liveLoader=!!window.__mvciLiveLoader;
    s.metadata.liveLoaderVersion=window.__mvciLiveLoader?.loaderVersion||s.metadata.liveLoaderVersion||null;
    s.metadata.runtimeLoadedAt=new Date().toISOString();
    s.metadata.updatedAt=new Date().toISOString();
    localStorage.setItem(STATE_KEY,JSON.stringify(s));
  }
  function loadRun(){ try{return JSON.parse(localStorage.getItem(RUN_KEY)||'null');}catch(_){return null;} }
  function saveRun(r){ if(!r)localStorage.removeItem(RUN_KEY); else localStorage.setItem(RUN_KEY,JSON.stringify(r)); }
  function iso(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  function pageDocuments(){
    const out=[],seen=new Set();
    function walk(doc){
      if(!doc||seen.has(doc))return; seen.add(doc); out.push(doc);
      let frames=[]; try{frames=[...doc.querySelectorAll('iframe,frame')];}catch(_){return;}
      for(const f of frames){try{if(f.contentDocument)walk(f.contentDocument);}catch(_){}}
    }
    walk(document); return out;
  }

  function parseDateText(text){
    const t=clean(text); let m;
    m=t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/); if(m)return iso(m[1],m[2],m[3]);
    m=t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/); if(m)return iso(m[3],m[1],m[2]);
    m=t.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})\b/i);
    if(m)return iso(m[3],MONTHS[m[1].toLowerCase()],m[2]);
    return null;
  }

  function displayedDate(){
    // ListView exposes the date in the hash on the FMFD deployment. Prefer it.
    let m=location.hash.match(/#?(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
    if(m)return iso(m[1],m[2],m[3]);
    for(const doc of pageDocuments()){
      const sels=['input[type="date"]','[data-date]','[data-day]','[datetime]','.date','[class*="date"]','h1','h2','h3'];
      for(const sel of sels){
        let els=[]; try{els=[...doc.querySelectorAll(sel)];}catch(_){continue;}
        for(const el of els){
          if(el.closest?.('#mvci-vs-panel,#mvci-vs-open'))continue;
          const vals=[el.value,el.getAttribute?.('data-date'),el.getAttribute?.('data-day'),el.getAttribute?.('datetime'),el.textContent];
          for(const v of vals){const d=parseDateText(v);if(d)return d;}
        }
      }
      const d=parseDateText(doc.body?.innerText||''); if(d)return d;
    }
    return null;
  }

  function pageMode(){
    const s=(location.pathname+' '+location.hash+' '+document.body?.innerText?.slice(0,2500)).toLowerCase();
    if(s.includes('listview')||s.includes('list view'))return 'ListView';
    if(s.includes('schedule'))return 'Schedule';
    return 'Unknown';
  }

  function priorDate(date){
    const d=new Date(`${date}T12:00:00`);
    d.setDate(d.getDate()-1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function dateToHash(date){
    const [y,m,d]=date.split('-');
    return `#${y}/${m}/${d}`;
  }

  function findPreviousControl(){
    const candidates=[];
    for(const doc of pageDocuments()){
      let els=[]; try{els=[...doc.querySelectorAll('button,a,[role="button"]')];}catch(_){continue;}
      for(const el of els){
        if(el.closest?.('#mvci-vs-panel,#mvci-vs-open'))continue;
        const label=clean(`${el.getAttribute?.('aria-label')||''} ${el.getAttribute?.('title')||''} ${el.textContent||''}`).toLowerCase();
        if(/previous\s*(day|date)?|prev\s*(day|date)?|prior\s*(day|date)?/.test(label))candidates.push({el,score:100});
        else if(/(^|\s)(‹|«|←|◀)(\s|$)/.test(label))candidates.push({el,score:20});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0]?.el||null;
  }

  async function waitForDate(target,timeout=12000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      await sleep(250);
      if(displayedDate()===target)return true;
    }
    return false;
  }

  async function navigatePrevious(current){
    const target=priorDate(current);
    // FMFD ListView uses #YYYY/MM/DD. Use that deterministic read-only route first.
    if(/\/ListView\/?$/i.test(location.pathname) || /\/ListView\//i.test(location.pathname)){
      const targetHash=dateToHash(target);
      if(location.hash!==targetHash){
        location.hash=targetHash;
        if(await waitForDate(target,7000)){
          await sleep(650);
          return target;
        }
      }
    }
    // Fallback if Vector changes its routing later.
    const prev=findPreviousControl();
    if(!prev)throw new Error(`Could not navigate from ${current} to the previous date.`);
    prev.click();
    if(!await waitForDate(target,10000))throw new Error(`Vector did not reach expected previous date ${target} from ${current}.`);
    await sleep(650);
    return target;
  }

  function captureSilently(){
    const btn=document.getElementById('vs-capture');
    if(!btn)throw new Error('Capture button is not available.');
    const before=loadState()?.metadata?.lastCaptureAt||null;
    const oldAlert=window.alert; let alertText='';
    window.alert=(msg)=>{alertText=clean(msg);};
    try{btn.click();}finally{window.alert=oldAlert;}
    const state=loadState();
    const after=state?.metadata?.lastCaptureAt||null;
    if(!after||after===before)throw new Error(alertText||'Capture did not create a new observation.');
    return {state,summary:state?.metadata?.lastCaptureSummary||null,capturedAt:after};
  }

  function compactCapturedDate(state,date,capturedAt){
    if(!Array.isArray(state?.observations))return;
    const people=new Set([...(state.settings?.firefighters||[]),...(state.settings?.command||[])].map(p=>p.id));
    const keep=[];
    const latest=new Map();
    for(const o of state.observations){
      const isVector=o.date===date && people.has(o.personId) && String(o.source||'').startsWith('vector-dom-readonly');
      if(!isVector){keep.push(o);continue;}
      const prev=latest.get(o.personId);
      if(!prev || String(o.capturedAt||'')>String(prev.capturedAt||''))latest.set(o.personId,o);
    }
    for(const o of latest.values())keep.push(o);
    state.observations=keep;
    state.metadata.lastBackfillCompactionAt=capturedAt;
  }

  function ensureBackfillRecord(state,run){
    state.backfillRuns=Array.isArray(state.backfillRuns)?state.backfillRuns:[];
    let rec=state.backfillRuns.find(x=>x.id===run.id);
    if(!rec){
      rec={id:run.id,startedAt:run.startedAt,startDate:run.startDate,startingDate:run.startingDate,status:run.status||'running',captures:run.captures||0};
      state.backfillRuns.push(rec);
    }
    return rec;
  }

  function persistRun(run,extra={}){
    Object.assign(run,extra,{updatedAt:new Date().toISOString()});
    saveRun(run);
    const state=loadState();
    if(state){
      const rec=ensureBackfillRecord(state,run);
      Object.assign(rec,{status:run.status,captures:run.captures||0,lastCapturedDate:run.lastCapturedDate||null,updatedAt:run.updatedAt,error:run.error||null,completedAt:run.completedAt||null,stoppedAt:run.stoppedAt||null});
      state.metadata.lastBackfillStatus=run.status;
      state.metadata.lastBackfillDate=run.lastCapturedDate||null;
      state.metadata.lastBackfillCaptures=run.captures||0;
      state.metadata.lastBackfillError=run.error||null;
      saveState(state);
    }
  }

  function updateProgress(text,kind='info'){
    const el=document.getElementById('vs-backfill-progress-v0110'); if(!el)return;
    el.textContent=text;
    el.style.color=kind==='error'?'#9b1c1c':(kind==='done'?'#136f3a':'#425466');
  }

  async function runBackfill(){
    let run=loadRun(); if(!run?.active)return;
    if(window.__mvciBackfillLoop0110)return;
    window.__mvciBackfillLoop0110=true;
    try{
      if(pageMode()!=='ListView')throw new Error('Open Vector ListView before running historical backfill.');
      while((run=loadRun())?.active){
        const date=displayedDate();
        if(!date)throw new Error('Could not determine the displayed Vector date during backfill.');
        updateProgress(`Running · ${date} · ${run.captures||0} dates captured`);

        const {state,summary,capturedAt}=captureSilently();
        compactCapturedDate(state,date,capturedAt);
        saveState(state);

        run.captures=(run.captures||0)+1;
        run.lastCapturedDate=date;
        run.lastSummary=summary;
        run.status='running';
        persistRun(run);

        if(date<=run.startDate){
          run.active=false; run.status='complete'; run.completedAt=new Date().toISOString();
          persistRun(run);
          updateProgress(`Complete · ${run.captures} calendar dates captured through ${date}`,'done');
          alert(`Historical backfill complete.\n\nCaptured ${run.captures} calendar dates through ${date}.\nExport the private state JSON and send it here for reconciliation.`);
          break;
        }

        await navigatePrevious(date);
      }
    }catch(err){
      run=loadRun()||{id:`error-${Date.now()}`,captures:0};
      run.active=false; run.status='stopped-error'; run.error=String(err?.message||err);
      persistRun(run);
      updateProgress(`Stopped safely: ${run.error}`,'error');
      alert(`Historical backfill stopped safely.\n\n${run.error}\n\nNo Vector data was changed.`);
    }finally{
      window.__mvciBackfillLoop0110=false;
      render();
    }
  }

  function startBackfill(){
    const state=loadState(); if(!state)throw new Error('Scheduling state has not been initialized.');
    const start=state.settings?.ratioStartDate||state.ratioPeriods?.find?.(p=>!p.endDate)?.startDate;
    if(!start)throw new Error('Set the active ratio start date first.');
    const current=displayedDate(); if(!current)throw new Error('Could not determine the displayed Vector date.');
    if(pageMode()!=='ListView')throw new Error('Open ListView first. Historical backfill intentionally prefers ListView.');
    if(current<start)throw new Error(`Displayed date ${current} is before active ratio start ${start}.`);
    if(!confirm(`Backfill Truck 504 history from ${current} backward through ${start}?\n\nREAD-ONLY against Vector. It will capture each calendar date and navigate by Vector's ListView date route. Stop is available at any time.`))return;
    const run={id:`bf-${Date.now()}`,active:true,status:'running',startedAt:new Date().toISOString(),startDate:start,startingDate:current,captures:0,lastCapturedDate:null,error:null};
    persistRun(run);
    render();
    setTimeout(runBackfill,100);
  }

  function stopBackfill(){
    const run=loadRun(); if(!run)return;
    run.active=false; run.status='stopped-user'; run.stoppedAt=new Date().toISOString();
    persistRun(run);
    updateProgress(`Stopped by user after ${run.captures||0} captured dates.`,'done');
    render();
  }

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function render(){
    const panel=document.getElementById('mvci-vs-panel'); if(!panel)return;
    // Hide obsolete development cards that can otherwise overwrite the visible runtime story.
    const stale=panel.querySelector('#vs-build-status-v080'); if(stale)stale.style.display='none';
    const oldBackfill=panel.querySelector('#vs-backfill-card-v090'); if(oldBackfill)oldBackfill.style.display='none';

    let card=panel.querySelector('#vs-backfill-card-v0110'); if(card)card.remove();
    const state=loadState(); if(!state)return;
    saveState(state);
    const run=loadRun();
    const start=state.settings?.ratioStartDate||'not set';
    const current=displayedDate()||'unknown';
    card=document.createElement('div'); card.id='vs-backfill-card-v0110'; card.className='vs-card';
    card.innerHTML=`<h3>Historical ratio backfill <span class="vs-muted">${PATCH_VERSION}</span></h3>
      <div class="vs-muted" style="margin-bottom:7px">ListView · ratio start ${esc(start)} · displayed ${esc(current)}</div>
      <div id="vs-backfill-progress-v0110" style="margin-bottom:8px">${run?.active?`Running/ready · ${run.captures||0} dates captured`:run?.status==='complete'?`Last run complete · ${run.captures||0} dates · through ${esc(run.lastCapturedDate||'')}`:run?.error?`Last run stopped: ${esc(run.error)}`:'Not running'}</div>
      <div style="display:flex;gap:6px"><button id="vs-backfill-start-v0110" class="vs-btn" style="flex:1">Backfill active ratio period</button><button id="vs-backfill-stop-v0110" class="vs-btn vs-btn-secondary" style="flex:0 0 90px" ${run?.active?'':'disabled'}>Stop</button></div>
      <div class="vs-muted" style="margin-top:7px">Read-only. Uses the ListView #YYYY/MM/DD route when available, saves run status into the exported private state, and keeps only the newest Vector observation per person/date during backfill.</div>`;
    const diag=panel.querySelector('#vs-capture-diagnostics-v070');
    if(diag)diag.insertAdjacentElement('afterend',card); else panel.appendChild(card);
    card.querySelector('#vs-backfill-start-v0110').onclick=()=>{try{startBackfill();}catch(e){alert(e.message||e);}};
    card.querySelector('#vs-backfill-stop-v0110').onclick=stopBackfill;

    let status=panel.querySelector('#vs-live-build-status-v0110'); if(status)status.remove();
    status=document.createElement('div'); status.id='vs-live-build-status-v0110'; status.className='vs-card'; status.style.border='2px solid #1b6ca8';
    const loader=window.__mvciLiveLoader?.loaderVersion||state.metadata?.liveLoaderVersion||'legacy/static loader';
    status.innerHTML=`<h3>Live build status</h3><div><b>Runtime:</b> ${PATCH_VERSION}</div><div><b>Loader:</b> ${esc(loader)}</div><div><b>Last capture reader:</b> ${esc(state.metadata?.lastCaptureVersion||'older/unknown')}</div><div><b>Backfill:</b> ${esc(state.metadata?.lastBackfillStatus||'not started')} · ${Number(state.metadata?.lastBackfillCaptures||0)} dates</div>`;
    const first=panel.querySelector('.vs-card'); if(first)first.insertAdjacentElement('beforebegin',status); else panel.prepend(status);
  }

  // Prevent the obsolete 0.9 card from reappearing visibly when its observer runs.
  const style=document.createElement('style');
  style.textContent='#vs-build-status-v080,#vs-backfill-card-v090{display:none!important}';
  document.documentElement.appendChild(style);

  const observer=new MutationObserver(()=>setTimeout(render,0));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  render();
  if(loadRun()?.active)setTimeout(runBackfill,700);
})();
