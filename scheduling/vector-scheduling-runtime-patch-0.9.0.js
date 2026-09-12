(function () {
  'use strict';

  const PATCH_VERSION = '0.9.0-dev';
  const STATE_KEY = 'missionVectorScheduling_v3';
  const RUN_KEY = 'missionVectorScheduling_backfill_v090';
  if (window.__mvciVectorSchedulingPatch090) return;
  window.__mvciVectorSchedulingPatch090 = { version: PATCH_VERSION, startedAt: Date.now() };

  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const MONTHS = {jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};

  function loadState(){ try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(_){return null;} }
  function saveState(s){ if(!s)return; s.metadata=s.metadata||{}; s.metadata.updatedAt=new Date().toISOString(); localStorage.setItem(STATE_KEY,JSON.stringify(s)); }
  function loadRun(){ try{return JSON.parse(sessionStorage.getItem(RUN_KEY)||'null');}catch(_){return null;} }
  function saveRun(r){ if(!r)sessionStorage.removeItem(RUN_KEY); else sessionStorage.setItem(RUN_KEY,JSON.stringify(r)); }
  function iso(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

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
    return parseDateText(location.href);
  }

  function pageMode(){
    const s=(location.pathname+' '+location.hash+' '+document.body?.innerText?.slice(0,2500)).toLowerCase();
    if(s.includes('listview')||s.includes('list view'))return 'ListView';
    if(s.includes('schedule'))return 'Schedule';
    return 'Unknown';
  }

  function dateHeaderElement(date){
    for(const doc of pageDocuments()){
      let nodes=[]; try{nodes=[...doc.querySelectorAll('h1,h2,h3,h4,.date,[class*="date"],div,span')];}catch(_){continue;}
      let best=null;
      for(const el of nodes){
        if(el.closest?.('#mvci-vs-panel,#mvci-vs-open'))continue;
        const txt=clean(el.textContent||'');
        if(!txt||txt.length>140||parseDateText(txt)!==date)continue;
        const r=el.getBoundingClientRect?.();
        const area=r?Math.max(1,r.width*r.height):999999;
        const score=(el.matches?.('h1,h2,h3,h4')?10:0)+(r&&r.top<260?5:0)-area/100000;
        if(!best||score>best.score)best={el,score};
      }
      if(best)return best.el;
    }
    return null;
  }

  function findPreviousControl(date){
    const explicit=[];
    for(const doc of pageDocuments()){
      let els=[]; try{els=[...doc.querySelectorAll('button,a,[role="button"]')];}catch(_){continue;}
      for(const el of els){
        if(el.closest?.('#mvci-vs-panel,#mvci-vs-open'))continue;
        const label=clean(`${el.getAttribute?.('aria-label')||''} ${el.getAttribute?.('title')||''} ${el.textContent||''}`).toLowerCase();
        if(!label)continue;
        let score=0;
        if(/previous\s*(day|date)?|prev\s*(day|date)?|prior\s*(day|date)?/.test(label))score+=100;
        if(/(^|\s)(‹|«|←|◀|<)(\s|$)/.test(label))score+=20;
        if(score)explicit.push({el,score,label});
      }
    }
    explicit.sort((a,b)=>b.score-a.score);
    if(explicit[0]?.score>=100)return explicit[0].el;

    const header=dateHeaderElement(date);
    if(header){
      const hr=header.getBoundingClientRect?.();
      let parent=header.parentElement;
      for(let depth=0;parent&&depth<4;depth++,parent=parent.parentElement){
        let controls=[]; try{controls=[...parent.querySelectorAll('button,a,[role="button"]')];}catch(_){controls=[];}
        const geom=[];
        for(const el of controls){
          if(el.closest?.('#mvci-vs-panel,#mvci-vs-open')||el===header)continue;
          const r=el.getBoundingClientRect?.();
          if(!r||!hr||r.width<4||r.height<4)continue;
          const sameBand=Math.abs((r.top+r.height/2)-(hr.top+hr.height/2))<55;
          const leftOf=r.right<=hr.left+15;
          if(sameBand&&leftOf){geom.push({el,dist:Math.abs(hr.left-r.right)});}
        }
        geom.sort((a,b)=>a.dist-b.dist);
        if(geom[0]&&geom[0].dist<180)return geom[0].el;
      }
    }
    return explicit[0]?.el||null;
  }

  function captureSilently(){
    const btn=document.getElementById('vs-capture');
    if(!btn)throw new Error('Capture button is not available.');
    const before=loadState()?.metadata?.lastCaptureAt||null;
    const oldAlert=window.alert;
    let alertText='';
    window.alert=(msg)=>{alertText=clean(msg);};
    try{btn.click();}finally{window.alert=oldAlert;}
    const state=loadState();
    const after=state?.metadata?.lastCaptureAt||null;
    if(!after||after===before)throw new Error(alertText||'Capture did not create a new observation.');
    return state?.metadata?.lastCaptureSummary||null;
  }

  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  async function waitForDateChange(oldDate,timeout=10000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      await sleep(250);
      const d=displayedDate();
      if(d&&d!==oldDate)return d;
    }
    throw new Error(`Vector did not change dates after ${oldDate}.`);
  }

  function updateProgress(text,kind='info'){
    const el=document.getElementById('vs-backfill-progress-v090'); if(!el)return;
    el.textContent=text;
    el.style.color=kind==='error'?'#9b1c1c':(kind==='done'?'#136f3a':'#425466');
  }

  async function runBackfill(){
    let run=loadRun(); if(!run?.active)return;
    if(window.__mvciBackfillLoopRunning)return;
    window.__mvciBackfillLoopRunning=true;
    try{
      if(pageMode()!=='ListView')throw new Error('Open Vector ListView before running historical backfill.');
      while(run?.active){
        const date=displayedDate(); if(!date)throw new Error('Could not determine the displayed Vector date during backfill.');
        updateProgress(`Backfill running · current ${date} · ${run.captures||0} dates captured`);

        const summary=captureSilently();
        run.captures=(run.captures||0)+1;
        run.lastCapturedDate=date;
        run.lastSummary=summary;
        run.updatedAt=new Date().toISOString();
        saveRun(run);

        const state=loadState();
        state.backfillRuns=Array.isArray(state.backfillRuns)?state.backfillRuns:[];
        const key=run.startedAt;
        let rec=state.backfillRuns.find(x=>x.startedAt===key);
        if(!rec){rec={startedAt:key,startDate:run.startDate,status:'running',captures:0};state.backfillRuns.push(rec);}
        rec.status='running'; rec.captures=run.captures; rec.lastCapturedDate=date; rec.updatedAt=run.updatedAt;
        saveState(state);

        if(date<=run.startDate){
          run.active=false; run.completedAt=new Date().toISOString(); saveRun(run);
          rec.status='complete'; rec.completedAt=run.completedAt; rec.captures=run.captures; rec.lastCapturedDate=date; saveState(state);
          updateProgress(`Backfill complete · ${run.captures} calendar dates captured through ${date}`,'done');
          alert(`Historical backfill complete.\n\nCaptured ${run.captures} calendar dates through ${date}.\nExport the private state JSON and send it here for reconciliation.`);
          break;
        }

        const prev=findPreviousControl(date);
        if(!prev)throw new Error(`Could not safely identify Vector's previous-date control on ${date}.`);
        prev.click();
        await waitForDateChange(date,10000);
        await sleep(650);
        run=loadRun();
      }
    }catch(err){
      run=loadRun()||{}; run.active=false; run.status='stopped-error'; run.error=String(err?.message||err); run.updatedAt=new Date().toISOString(); saveRun(run);
      const state=loadState(); if(state){state.metadata=state.metadata||{};state.metadata.lastBackfillError=run.error;saveState(state);}
      updateProgress(`Backfill stopped: ${run.error}`,'error');
      alert(`Historical backfill stopped safely.\n\n${run.error}\n\nNo Vector data was changed.`);
    }finally{
      window.__mvciBackfillLoopRunning=false;
      renderCard();
    }
  }

  function startBackfill(){
    const state=loadState(); if(!state)throw new Error('Scheduling state has not been initialized.');
    const start=state.settings?.ratioStartDate||state.ratioPeriods?.find?.(p=>!p.endDate)?.startDate;
    if(!start)throw new Error('Set the active ratio start date first.');
    const current=displayedDate(); if(!current)throw new Error('Could not determine the displayed Vector date.');
    if(pageMode()!=='ListView')throw new Error('Open ListView first. Historical backfill intentionally prefers ListView.');
    if(current<start)throw new Error(`Displayed date ${current} is before active ratio start ${start}.`);
    if(!confirm(`Backfill Truck 504 history from ${current} backward through ${start}?\n\nThis is READ-ONLY against Vector. It will navigate one calendar day at a time and save observations locally. Stop is available at any time.`))return;
    const run={active:true,status:'running',startedAt:new Date().toISOString(),startDate:start,startingDate:current,captures:0};
    saveRun(run); renderCard(); setTimeout(runBackfill,150);
  }

  function stopBackfill(){
    const run=loadRun(); if(!run)return;
    run.active=false; run.status='stopped-user'; run.stoppedAt=new Date().toISOString(); saveRun(run);
    updateProgress(`Backfill stopped by user after ${run.captures||0} captured dates.`,'done');
    renderCard();
  }

  function renderCard(){
    const panel=document.getElementById('mvci-vs-panel'); if(!panel)return;
    let old=panel.querySelector('#vs-backfill-card-v090'); if(old)old.remove();
    const state=loadState(); if(!state)return;
    const run=loadRun();
    const start=state.settings?.ratioStartDate||'not set';
    const current=displayedDate()||'unknown';
    const card=document.createElement('div'); card.id='vs-backfill-card-v090'; card.className='vs-card';
    card.innerHTML=`<h3>Historical ratio backfill <span class="vs-muted">${PATCH_VERSION}</span></h3>
      <div class="vs-muted" style="margin-bottom:7px">ListView preferred · active ratio start ${start} · displayed ${current}</div>
      <div id="vs-backfill-progress-v090" style="margin-bottom:8px">${run?.active?`Backfill ready/running · ${run.captures||0} dates captured`:(run?.status==='complete'?`Last backfill complete · ${run.captures||0} dates`:run?.error?`Last backfill stopped: ${clean(run.error)}`:'Not running')}</div>
      <div style="display:flex;gap:6px"><button id="vs-backfill-start-v090" class="vs-btn" style="flex:1">Backfill active ratio period</button><button id="vs-backfill-stop-v090" class="vs-btn vs-btn-secondary" style="flex:0 0 90px" ${run?.active?'':'disabled'}>Stop</button></div>
      <div class="vs-muted" style="margin-top:7px">Read-only. Captures every calendar date so unusual staffing, deployments, time off, and partial-day evidence are not skipped. Nothing is written to Vector.</div>`;
    const diag=panel.querySelector('#vs-capture-diagnostics-v070');
    if(diag)diag.insertAdjacentElement('afterend',card); else panel.appendChild(card);
    card.querySelector('#vs-backfill-start-v090').onclick=()=>{try{startBackfill();}catch(e){alert(e.message||e);}};
    card.querySelector('#vs-backfill-stop-v090').onclick=stopBackfill;
  }

  function wire(){renderCard();const r=loadRun();if(r?.active)setTimeout(runBackfill,900);}
  const observer=new MutationObserver(()=>setTimeout(renderCard,0));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  wire();
})();
