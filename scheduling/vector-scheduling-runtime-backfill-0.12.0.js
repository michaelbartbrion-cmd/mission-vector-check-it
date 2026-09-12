(function () {
  'use strict';

  const VERSION='0.12.0-dev';
  const STATE_KEY='missionVectorScheduling_v3';
  const RUN_KEY='missionVectorScheduling_backfill_v0120';
  if(window.top!==window.self||window.__mvciVectorBackfill0120)return;
  window.__mvciVectorBackfill0120={version:VERSION,startedAt:Date.now()};

  const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function loadState(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(_){return null;}}
  function saveState(s){if(!s)return;s.metadata=s.metadata||{};s.metadata.runtimeVersion=VERSION;s.metadata.liveLoader=!!window.__mvciLiveLoader;s.metadata.liveLoaderVersion=window.__mvciLiveLoader?.loaderVersion||null;s.metadata.runtimeLoadedAt=new Date().toISOString();s.metadata.updatedAt=new Date().toISOString();localStorage.setItem(STATE_KEY,JSON.stringify(s));}
  function loadRun(){try{return JSON.parse(localStorage.getItem(RUN_KEY)||'null');}catch(_){return null;}}
  function saveRun(r){if(!r)localStorage.removeItem(RUN_KEY);else localStorage.setItem(RUN_KEY,JSON.stringify(r));}
  function priorDate(date){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function dateToHash(date){const[y,m,d]=date.split('-');return `#${y}/${m}/${d}`;}
  function reader(){const r=window.MVCI_VECTOR_READER_0120;if(!r)throw new Error('Vector reader 0.12.0 is not loaded. Refresh Vector and try again.');return r;}

  function ensureBackfillRecord(state,run){
    state.backfillRuns=Array.isArray(state.backfillRuns)?state.backfillRuns:[];
    let rec=state.backfillRuns.find(x=>x.id===run.id);
    if(!rec){rec={id:run.id,startedAt:run.startedAt,startDate:run.startDate,startingDate:run.startingDate,status:run.status||'running',captures:run.captures||0};state.backfillRuns.push(rec);}
    return rec;
  }
  function persistRun(run,extra={}){
    Object.assign(run,extra,{updatedAt:new Date().toISOString()});saveRun(run);
    const state=loadState();if(!state)return;
    const rec=ensureBackfillRecord(state,run);
    Object.assign(rec,{status:run.status,captures:run.captures||0,lastCapturedDate:run.lastCapturedDate||null,updatedAt:run.updatedAt,error:run.error||null,completedAt:run.completedAt||null,stoppedAt:run.stoppedAt||null});
    state.metadata=state.metadata||{};state.metadata.lastBackfillStatus=run.status;state.metadata.lastBackfillDate=run.lastCapturedDate||null;state.metadata.lastBackfillCaptures=run.captures||0;state.metadata.lastBackfillError=run.error||null;saveState(state);
  }

  function compactCapturedDate(state,date){
    if(!Array.isArray(state?.observations))return;
    const tracked=new Set([...(state.settings?.firefighters||[]),...(state.settings?.command||[])].map(p=>p.id));
    const keep=[],latest=new Map();
    for(const o of state.observations){
      const ours=o.date===date&&tracked.has(o.personId)&&String(o.source||'').startsWith('vector-dom-readonly-v0120');
      if(!ours){keep.push(o);continue;}
      const prev=latest.get(o.personId);if(!prev||String(o.capturedAt||'')>String(prev.capturedAt||''))latest.set(o.personId,o);
    }
    for(const o of latest.values())keep.push(o);state.observations=keep;
  }

  async function waitForVisibleDate(target,timeout=15000){
    const started=Date.now();let consecutive=0;
    while(Date.now()-started<timeout){
      await sleep(250);
      const visible=reader().visibleDisplayedDate();
      if(visible===target){consecutive++;if(consecutive>=2)return true;}else consecutive=0;
    }
    return false;
  }

  function findPreviousControl(){
    const candidates=[];
    for(const doc of reader().pageDocuments()){
      let els=[];try{els=[...doc.querySelectorAll('button,a,[role="button"]')];}catch(_){continue;}
      for(const el of els){
        if(el.closest?.('#mvci-vs-panel,#mvci-vs-open'))continue;
        const label=clean(`${el.getAttribute?.('aria-label')||''} ${el.getAttribute?.('title')||''} ${el.textContent||''}`).toLowerCase();
        if(/previous\s*(day|date)?|prev\s*(day|date)?|prior\s*(day|date)?/.test(label))candidates.push({el,score:100});
        else if(/(^|\s)(‹|«|←|◀)(\s|$)/.test(label))candidates.push({el,score:20});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);return candidates[0]?.el||null;
  }

  async function navigatePrevious(current){
    const target=priorDate(current);
    if(/\/ListView\/?$/i.test(location.pathname)||/\/ListView\//i.test(location.pathname)){
      location.hash=dateToHash(target);
      if(await waitForVisibleDate(target,15000)){await sleep(500);return target;}
    }
    const prev=findPreviousControl();if(!prev)throw new Error(`Could not navigate from ${current} to ${target}.`);
    prev.click();if(!await waitForVisibleDate(target,15000))throw new Error(`Vector did not visibly load expected date ${target} from ${current}.`);
    await sleep(500);return target;
  }

  function captureCurrent(){
    const out=reader().captureNow();
    const state=loadState();compactCapturedDate(state,out.date);saveState(state);
    return out;
  }

  async function runBackfill(){
    let run=loadRun();if(!run?.active||window.__mvciBackfillLoop0120)return;
    window.__mvciBackfillLoop0120=true;
    try{
      if(reader().pageMode()!=='ListView')throw new Error('Open Vector ListView before running historical backfill.');
      while((run=loadRun())?.active){
        const visible=reader().visibleDisplayedDate();
        const date=visible||reader().displayedDate();
        if(!date)throw new Error('Could not determine the visibly displayed Vector date during backfill.');
        const out=captureCurrent();
        if(out.date!==date)throw new Error(`Reader/date mismatch: visible ${date}, capture ${out.date}. Backfill stopped rather than mis-date evidence.`);
        run.captures=(run.captures||0)+1;run.lastCapturedDate=date;run.lastSummary=loadState()?.metadata?.lastCaptureSummary||null;run.status='running';persistRun(run);refreshUI();
        if(date<=run.startDate){run.active=false;run.status='complete';run.completedAt=new Date().toISOString();persistRun(run);refreshUI();alert(`Historical backfill complete.\n\nCaptured ${run.captures} calendar dates through ${date}.\nExport the private state JSON and send it here for reconciliation.`);break;}
        await navigatePrevious(date);
      }
    }catch(err){
      run=loadRun()||{id:`error-${Date.now()}`,captures:0};run.active=false;run.status='stopped-error';run.error=String(err?.message||err);persistRun(run);refreshUI();alert(`Historical backfill stopped safely.\n\n${run.error}\n\nNo Vector data was changed.`);
    }finally{window.__mvciBackfillLoop0120=false;refreshUI();}
  }

  function startBackfill(){
    const state=loadState();if(!state)throw new Error('Scheduling state has not been initialized.');
    const start=state.settings?.ratioStartDate||state.ratioPeriods?.find?.(p=>!p.endDate)?.startDate;if(!start)throw new Error('Set the active ratio start date first.');
    const current=reader().visibleDisplayedDate()||reader().displayedDate();if(!current)throw new Error('Could not determine the displayed Vector date.');
    if(reader().pageMode()!=='ListView')throw new Error('Open ListView first.');if(current<start)throw new Error(`Displayed date ${current} is before active ratio start ${start}.`);
    if(!confirm(`Backfill Truck 504 history from ${current} backward through ${start}?\n\nREAD-ONLY against Vector. The reader will wait for each visible date to load before capturing it.`))return;
    const run={id:`bf-${Date.now()}`,active:true,status:'running',startedAt:new Date().toISOString(),startDate:start,startingDate:current,captures:0,lastCapturedDate:null,error:null};persistRun(run);refreshUI();setTimeout(runBackfill,150);
  }
  function stopBackfill(){const run=loadRun();if(!run)return;run.active=false;run.status='stopped-user';run.stoppedAt=new Date().toISOString();persistRun(run);refreshUI();}

  function ensureStyle(){if(document.getElementById('vs-v0120-hide-old'))return;const s=document.createElement('style');s.id='vs-v0120-hide-old';s.textContent='#vs-build-status-v080,#vs-live-build-status-v0100,#vs-live-build-status-v0110,#vs-backfill-card-v090,#vs-backfill-card-v0110,#vs-capture-diagnostics-v070{display:none!important}';document.documentElement.appendChild(s);}

  function setCard(panel,id,html,where){
    let card=panel.querySelector('#'+id);if(!card){card=document.createElement('div');card.id=id;card.className='vs-card';where(card);}
    if(card.dataset.html!==html){card.dataset.html=html;card.innerHTML=html;}
    return card;
  }

  function refreshUI(){
    ensureStyle();const panel=document.getElementById('mvci-vs-panel');if(!panel)return;
    const state=loadState();if(!state)return;saveState(state);
    const run=loadRun(),loader=window.__mvciLiveLoader?.loaderVersion||state.metadata?.liveLoaderVersion||'legacy/static loader';
    const statusHtml=`<h3>Live build status</h3><div><b>Runtime:</b> ${VERSION}</div><div><b>Loader:</b> ${esc(loader)}</div><div><b>Reader:</b> ${esc(window.MVCI_VECTOR_READER_0120?.version||'missing')}</div><div><b>Backfill:</b> ${esc(state.metadata?.lastBackfillStatus||'not started')} · ${Number(state.metadata?.lastBackfillCaptures||0)} dates</div>`;
    setCard(panel,'vs-live-build-status-v0120',statusHtml,card=>{const first=panel.querySelector('.vs-card');if(first)first.insertAdjacentElement('beforebegin',card);else panel.prepend(card);});

    const start=state.settings?.ratioStartDate||state.ratioPeriods?.find?.(p=>!p.endDate)?.startDate||'not set';const current=window.MVCI_VECTOR_READER_0120?.visibleDisplayedDate?.()||window.MVCI_VECTOR_READER_0120?.displayedDate?.()||'unknown';
    const progress=run?.active?`Running · ${run.lastCapturedDate||current} · ${run.captures||0} dates captured`:run?.status==='complete'?`Last run complete · ${run.captures||0} dates · through ${run.lastCapturedDate||''}`:run?.error?`Last run stopped: ${run.error}`:'Not running';
    const backfillHtml=`<h3>Historical ratio backfill <span class="vs-muted">${VERSION}</span></h3><div class="vs-muted" style="margin-bottom:7px">ListView · ratio start ${esc(start)} · displayed ${esc(current)}</div><div style="margin-bottom:8px">${esc(progress)}</div><div style="display:flex;gap:6px"><button id="vs-backfill-start-v0120" class="vs-btn" style="flex:1" ${run?.active?'disabled':''}>Backfill active ratio period</button><button id="vs-backfill-stop-v0120" class="vs-btn secondary" style="flex:0 0 90px" ${run?.active?'':'disabled'}>Stop</button></div><div class="vs-muted" style="margin-top:7px">Read-only. It waits for Vector's visible ListView date to change before each capture, so URL changes cannot silently mis-date a stale page.</div>`;
    const card=setCard(panel,'vs-backfill-card-v0120',backfillHtml,c=>{const diag=panel.querySelector('#vs-capture-diagnostics-v0120');if(diag)diag.insertAdjacentElement('afterend',c);else panel.appendChild(c);});
    const startBtn=card.querySelector('#vs-backfill-start-v0120');if(startBtn&&!startBtn.dataset.wired){startBtn.dataset.wired='1';startBtn.onclick=()=>{try{startBackfill();}catch(e){alert(e.message||e);}};}
    const stopBtn=card.querySelector('#vs-backfill-stop-v0120');if(stopBtn&&!stopBtn.dataset.wired){stopBtn.dataset.wired='1';stopBtn.onclick=stopBackfill;}
  }

  setInterval(refreshUI,1200);setTimeout(refreshUI,300);if(loadRun()?.active)setTimeout(runBackfill,1200);
  window.MVCI_VECTOR_BACKFILL_0120={version:VERSION,startBackfill,stopBackfill,runBackfill,navigatePrevious};
})();
