(function () {
  'use strict';

  const VERSION = '0.27.0-dev';
  const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const PAIR_KEY = 'vectorStaffingCollectorPairing_v1';
  const ROOT_ID = 'mvci-command-center-v0270';
  const STYLE_ID = 'mvci-command-center-style-v0270';
  const QUEUE_KEY = 'mvciServerDrivenSync_v0270';
  const STATUS_KEY = 'mvciCommandStatus_v0270';
  const LEGACY_STATUS_KEY = 'mvciControlStatus_v0250';
  const AUTO_KEY = 'mvciServerDrivenAuto_v0270';
  const LEGACY_AUTO_KEY = 'mvciRangeAutoAttempted_v0250';
  const LOCK_KEY = 'mvciDataSyncOwner_v0270';
  const TAB_KEY = 'mvciCommandTabId_v0270';
  const RANKING_PATH_KEY = 'mvciLastRankingPath_v1';
  const ICON_CACHE_KEY = 'mvciVectorRebelIconData_v1';
  const REBEL_SOURCE = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js';
  const DEFAULT_RANKING_PATH = '/Application/ControlPanel/CallbackModule/Rankings/63542/95668';
  const LOCK_STALE_MS = 30000;

  if (window.top !== window.self || window.MVCI_COMMAND_CENTER_0270) return;

  const state = { open:false, settings:false, busy:false, message:'', kind:'info', plan:null, actions:[], icon:'' };
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function loadJson(key, fallback={}) { try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
  function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function removeKey(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function tabId() { try { let id=sessionStorage.getItem(TAB_KEY); if(!id){ id=`${Date.now()}-${Math.random().toString(36).slice(2,10)}`; sessionStorage.setItem(TAB_KEY,id); } return id; } catch (_) { return `volatile-${Date.now()}`; } }
  const THIS_TAB = tabId();

  function pairing() { const p=loadJson(PAIR_KEY,{}); return { deviceId:clean(p.deviceId), token:clean(p.token), endpoint:clean(p.endpoint)||ENDPOINT }; }
  function paired() { const p=pairing(); return !!(p.deviceId && p.token); }
  async function request(path='', options={}) {
    const p=pairing();
    if(!p.deviceId || !p.token) throw new Error('Rebel Command pairing is not configured.');
    const res=await fetch(`${p.endpoint||ENDPOINT}${path}`, {
      method:options.method||'GET', cache:'no-store', credentials:'omit',
      headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId,...(options.body?{'Content-Type':'application/json'}:{})},
      ...(options.body?{body:JSON.stringify(options.body)}:{})
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok || body?.ok===false) throw new Error(clean(body?.error||`Rebel Command request failed (${res.status})`));
    return body;
  }

  function saveStatus(message, kind='info') { state.message=clean(message); state.kind=kind; saveJson(STATUS_KEY,{message:state.message,kind,at:Date.now()}); render(); }
  function restoreStatus() {
    const own=loadJson(STATUS_KEY,{}), legacy=loadJson(LEGACY_STATUS_KEY,{});
    const pick=(Number(legacy.at)||0)>(Number(own.at)||0)?legacy:own;
    if(pick?.message){ state.message=clean(pick.message); state.kind=clean(pick.kind)||'info'; }
  }

  function parseDate(value){const t=decodeURIComponent(clean(value).replace(/^#/,''));let m=t.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);if(m)return`${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;m=t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);if(m)return`${m[3]}-${String(Number(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;return'';}
  function visibleDate(){for(const v of[location.hash,location.pathname,location.search]){const d=parseDate(v);if(d)return d;}const reader=window.MVCI_VECTOR_READER_0120;const r=clean(reader?.visibleDisplayedDate?.()||reader?.displayedDate?.());if(/^\d{4}-\d{2}-\d{2}$/.test(r))return r;const ds=[...document.querySelectorAll('input')].map(el=>parseDate(el.value)).filter(Boolean),u=[...new Set(ds)];return u.length===1?u[0]:'';}
  function isListView(){return /\/Application\/ControlPanel\/ListView/i.test(location.pathname);}
  function isRankingPage(){return /\/Application\/ControlPanel\/CallbackModule\/Rankings/i.test(location.pathname);}
  if(isRankingPage()) saveJson(RANKING_PATH_KEY,{path:location.pathname,at:Date.now()});
  function dateParts(date){const[y,m,d]=date.split('-');return{hash:`${y}/${m}/${d}`,us:`${m}/${d}/${y}`};}
  function listViewUrl(date){return`${location.origin}/Application/ControlPanel/ListView/#${dateParts(date).hash}`;}
  function rankingUrl(date){const p=dateParts(date),saved=loadJson(RANKING_PATH_KEY,{}),path=/^\/Application\/ControlPanel\/CallbackModule\/Rankings\//i.test(clean(saved.path))?clean(saved.path):DEFAULT_RANKING_PATH;return`${location.origin}${path}?shift_date=${encodeURIComponent(p.us)}&select-date=`;}

  function currentLock(){return loadJson(LOCK_KEY,{});}
  function ownLock(force=false){const old=currentLock(),now=Date.now();if(!force && old.tabId && old.tabId!==THIS_TAB && now-Number(old.heartbeat||0)<LOCK_STALE_MS)return false;saveJson(LOCK_KEY,{tabId:THIS_TAB,heartbeat:now});return true;}
  function pulseLock(){const x=currentLock();if(x.tabId===THIS_TAB)saveJson(LOCK_KEY,{tabId:THIS_TAB,heartbeat:Date.now()});}
  function releaseLock(){const x=currentLock();if(x.tabId===THIS_TAB)removeKey(LOCK_KEY);}

  async function syncPlan(){const p=await request('?action=range-sync-plan');state.plan=p;return p;}
  async function refreshActions(){const b=await request('?action=action-worklist');state.actions=Array.isArray(b?.packages)?b.packages:[];return state.actions;}

  async function collectStaffing(date){
    const bridge=await waitFor(()=>window.MVCI_VECTOR_BRIDGE_0200?.scrapeNow?window.MVCI_VECTOR_BRIDGE_0200:null,20000);
    if(!bridge)throw new Error('Vector staffing collector did not load.');
    if(visibleDate()!==date)throw new Error(`ListView opened on ${visibleDate()||'an unknown date'} instead of ${date}.`);
    await bridge.scrapeNow();
    const s=bridge.status?.()||{};
    if(s.status==='sent-good'){const c=s.lastCapture||{};return`Staffing ${date}: ${c.rows??'—'} rows, ${c.regular??'—'} regular 24-hour.`;}
    if(s.status==='sent-partial')throw new Error(`Staffing ${date} was collected but failed the full-census safety check.`);
    if(s.status==='error')throw new Error(s.lastError||`Staffing ${date} failed.`);
    throw new Error(`Staffing ${date} ended with ${s.status||'unknown'}.`);
  }
  async function collectOvertime(date){
    if(visibleDate()!==date)throw new Error(`OT Rankings opened on ${visibleDate()||'an unknown date'} instead of ${date}.`);
    const api=await waitFor(()=>window.MVCI_OVERTIME_COLLECTOR?.captureRanking?window.MVCI_OVERTIME_COLLECTOR:window.__vectorOvertimeCollector?.capture?{captureRanking:()=>window.__vectorOvertimeCollector.capture()}:null,20000);
    if(!api)throw new Error('OT Priority collector did not load.');
    const r=await api.captureRanking({force:true});
    if(r?.ranking?.quality==='good')return`OT priority ${date}: accepted.`;
    if(r?.ranking?.quality==='partial')throw new Error(`OT priority ${date} was collected but Rebel Command marked it for review.`);
    if(r?.ok===false)throw new Error(r.error||`OT priority ${date} failed.`);
    return`OT priority ${date}: collection finished.`;
  }

  function queue(){return loadJson(QUEUE_KEY,{active:false,index:0,items:[],results:[],attempted:[]});}
  function saveQueue(q){saveJson(QUEUE_KEY,q);}
  function itemKey(x){return`${x.type}:${x.workDate}`;}
  function mergeNewNeeded(q, plan){
    const attempted=new Set(q.attempted||[]), existing=new Set((q.items||[]).map(itemKey));
    let added=0;
    for(const item of(plan.worklist||[])){
      const k=itemKey(item);
      if(attempted.has(k)||existing.has(k))continue;
      q.items.push(item); existing.add(k); added++;
    }
    return added;
  }

  function stopSync(message='Data sync stopped.'){
    const q=queue();q.active=false;q.stoppedAt=Date.now();saveQueue(q);state.busy=false;releaseLock();saveStatus(message,'info');
  }

  async function finishOrExtend(q){
    let plan;
    try{plan=await syncPlan();}catch(e){q.active=false;saveQueue(q);releaseLock();saveStatus(`Sync finished, but final Rebel Command check failed: ${clean(e?.message||e)}`,'error');return true;}
    const added=mergeNewNeeded(q,plan);
    if(added){saveQueue(q);return false;}
    const attempted=new Set(q.attempted||[]), remaining=(plan.worklist||[]).filter(x=>!attempted.has(itemKey(x)));
    if(remaining.length){q.items.push(...remaining);saveQueue(q);return false;}
    q.active=false;q.completedAt=Date.now();saveQueue(q);releaseLock();state.busy=false;
    const good=(q.results||[]).filter(x=>x.ok).length,bad=(q.results||[]).filter(x=>!x.ok).length,serverRemaining=(plan.worklist||[]).length;
    if(serverRemaining||bad)saveStatus(`Sync finished: ${good} checks succeeded. ${Math.max(serverRemaining,bad)} item${Math.max(serverRemaining,bad)===1?'':'s'} still need review.`,'error');
    else saveStatus(`Rebel Command sync complete. ${good} checks succeeded and no required data is currently missing.`,'success');
    return true;
  }

  async function runQueue(){
    let q=queue();
    if(!q.active)return;
    if(!ownLock(false)){q.active=false;saveQueue(q);saveStatus('Data sync is already running in another CrewSense tab.','info');return;}
    pulseLock();state.open=true;state.busy=true;
    if(q.index>=q.items.length){if(await finishOrExtend(q))return;q=queue();}
    const item=q.items[q.index];
    const date=item.workDate;
    state.message=`Syncing Rebel Command · ${q.index+1}/${q.items.length} · ${item.type==='staffing'?'staffing':'OT priority'} · ${date}`;state.kind='info';render();
    const correct=item.type==='staffing'?(isListView()&&visibleDate()===date):(isRankingPage()&&visibleDate()===date);
    if(!correct){location.assign(item.type==='staffing'?listViewUrl(date):rankingUrl(date));return;}
    let ok=true,message='';
    try{message=item.type==='staffing'?await collectStaffing(date):await collectOvertime(date);}catch(e){ok=false;message=clean(e?.message||e);}
    q=queue();q.results=q.results||[];q.attempted=q.attempted||[];q.results.push({key:itemKey(item),ok,message,at:Date.now()});if(!q.attempted.includes(itemKey(item)))q.attempted.push(itemKey(item));q.index++;saveQueue(q);pulseLock();
    await wait(650);runQueue();
  }

  async function startSync(automatic=false){
    if(!paired()){if(!automatic)saveStatus('Pair Rebel Command before syncing.','error');return;}
    if(!ownLock(false)){if(!automatic)saveStatus('Data sync is already running in another CrewSense tab.','info');return;}
    const existing=queue();if(existing.active){state.open=true;runQueue();return;}
    state.busy=true;if(!automatic)state.open=true;render();
    try{
      const plan=await syncPlan();
      if(automatic&&plan?.config?.enabled===false){state.busy=false;releaseLock();render();return;}
      const hard=Math.max(1,Number(plan?.config?.hardSafetyMaxChecks)||250),items=(plan.worklist||[]).slice(0,hard);
      const q={active:items.length>0,startedAt:Date.now(),index:0,items,results:[],attempted:[],automatic,hardSafetyMax:hard};saveQueue(q);state.busy=false;
      if(!items.length){releaseLock();saveStatus('Rebel Command is current. No data needs scraping right now.','success');return;}
      saveStatus(`${automatic?'Automatic':'Manual'} Rebel Command sync started. ${items.length} required checks are queued; the list may grow after staffing analysis identifies OT-priority dates.`,'info');runQueue();
    }catch(e){state.busy=false;releaseLock();if(!automatic)saveStatus(`Sync could not start: ${clean(e?.message||e)}`,'error');}
  }

  async function startNextAction(type){
    if(!paired())return saveStatus('Pair Rebel Command before using action controls.','error');
    state.busy=true;render();
    try{
      const actions=await refreshActions();
      const matches=actions.filter(x=>x.actionType===type).sort((a,b)=>{
        if(a.stage==='reread_verification'&&b.stage!=='reread_verification')return-1;
        if(b.stage==='reread_verification'&&a.stage!=='reread_verification')return 1;
        return String(a.targetDate||'').localeCompare(String(b.targetDate||''));
      });
      if(!matches.length)throw new Error(type==='schedule'?'No approved riding-plan changes are waiting. Agree/approve them in Rebel Command Scheduling first.':'No approved OT signups are waiting. Mark the days you want in Rebel Command Overtime and approve the signup first.');
      const pkg=matches[0];
      const old=await waitFor(()=>window.MVCI_CONTROL_PANEL_0250?.startInput?window.MVCI_CONTROL_PANEL_0250:null,10000);
      if(!old)throw new Error('Mission Vector action runner did not load.');
      state.busy=false;saveStatus(`${pkg.stage==='reread_verification'?'Verifying':'Preparing'} ${type==='schedule'?'riding-plan change':'OT signup'} for ${pkg.targetDate}. Mission Vector will open the required screen.`,'info');
      old.startInput(type,pkg.targetDate);
    }catch(e){state.busy=false;saveStatus(clean(e?.message||e),'error');}
  }

  async function checkConnection(){state.busy=true;render();try{const b=await request('');await Promise.all([syncPlan(),refreshActions()]);saveStatus(`Rebel Command connected. Device ${b?.deviceId||'verified'}.`,'success');}catch(e){saveStatus(`Connection failed: ${clean(e?.message||e)}`,'error');}finally{state.busy=false;render();}}

  function cachedIcon(){try{const v=sessionStorage.getItem(ICON_CACHE_KEY)||localStorage.getItem(ICON_CACHE_KEY)||'';return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)?v:'';}catch(_){return'';}}
  async function loadIcon(){let v=cachedIcon();if(v){state.icon=v;render();return;}try{const res=await fetch(`${REBEL_SOURCE}?t=${Date.now()}`,{cache:'no-store'});const text=await res.text(),m=text.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/);if(m){state.icon=m[0];try{localStorage.setItem(ICON_CACHE_KEY,m[0]);}catch(_){}render();}}catch(_){} }

  function ensureStyle(){if(document.getElementById(STYLE_ID))return;const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`#mvci-control-panel-v0250{display:none!important}#${ROOT_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;font-family:Arial,sans-serif;color:#18384f}#${ROOT_ID} *{box-sizing:border-box}#${ROOT_ID} .panel{width:390px;max-width:calc(100vw - 28px);margin-bottom:10px;border:1px solid #cbd9e2;border-radius:12px;background:#fff;box-shadow:0 10px 28px rgba(12,43,62,.22);overflow:hidden}#${ROOT_ID} .head{display:flex;gap:10px;align-items:center;padding:13px 14px 11px;background:#153e5c;color:#fff}#${ROOT_ID} .headtext{flex:1;min-width:0}#${ROOT_ID} .title{font-size:17px;font-weight:700}#${ROOT_ID} .sub{font-size:10px;opacity:.78;margin-top:2px}#${ROOT_ID} .close{width:31px;height:31px;border:1px solid rgba(255,255,255,.25);border-radius:7px;background:rgba(255,255,255,.08);color:#fff;font:400 21px/27px Arial;padding:0;cursor:pointer}#${ROOT_ID} .body{padding:12px 13px 13px;background:#fff}#${ROOT_ID} .info{font-size:11px;margin:0 0 10px;padding:9px 10px;line-height:1.45;background:#f3f7f9;border:1px solid #e0e8ed;border-radius:8px;color:#4f6878;display:flex;justify-content:space-between;gap:10px}#${ROOT_ID} .dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#16a34a;margin-right:5px}#${ROOT_ID} .dot.off{background:#f59e0b}#${ROOT_ID} .actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}#${ROOT_ID} .btn{min-height:44px;padding:10px 9px;border-radius:8px;cursor:pointer;border:1px solid #176b8e;background:#176b8e;color:#fff;font:700 12px/1.2 Arial;box-shadow:0 1px 2px rgba(15,43,62,.08)}#${ROOT_ID} .btn.sync{grid-column:1/-1;background:#153e5c;border-color:#153e5c;min-height:50px}#${ROOT_ID} .btn.secondary{background:#fff;color:#153e5c;border-color:#b8c8d6;min-height:36px}#${ROOT_ID} .btn:disabled{opacity:.55;cursor:default}#${ROOT_ID} .status{margin-top:10px;padding:8px 9px;background:#f7f9fa;border-top:1px solid #e7edf1;font-size:11px;line-height:1.4;color:#607483;border-radius:6px}#${ROOT_ID} .status.success{background:#f0fbf5;border:1px solid #a7d9bd;color:#216340}#${ROOT_ID} .status.error{background:#fff4f4;border:1px solid #efb2b2;color:#8b2c2c}#${ROOT_ID} .foot{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:8px}#${ROOT_ID} .settings{margin-top:8px;padding:8px 9px;border:1px solid #dde5e9;border-radius:7px;background:#f8fafb;font-size:10px;line-height:1.45;color:#617681}#${ROOT_ID} .orb{width:54px;height:54px;display:flex;align-items:center;justify-content:center;padding:0;margin-left:auto;border:2px solid #1b5a7a;border-radius:50%;background:#fff;box-shadow:0 5px 18px rgba(13,50,72,.28);cursor:pointer;overflow:hidden}#${ROOT_ID} .orb img{display:block;width:39px;height:39px;object-fit:contain;pointer-events:none;user-select:none}@media(max-width:540px){#${ROOT_ID}{right:10px;bottom:10px}#${ROOT_ID} .panel{width:min(390px,calc(100vw - 20px))}}`;document.documentElement.appendChild(s);}

  function render(){
    ensureStyle();let root=document.getElementById(ROOT_ID);if(!root){root=document.createElement('div');root.id=ROOT_ID;document.documentElement.appendChild(root);}
    const q=queue(), syncing=q.active===true, scheduleCount=state.actions.filter(x=>x.actionType==='schedule').length,otCount=state.actions.filter(x=>x.actionType==='overtime_signup').length;
    const runtime=clean(document.documentElement.dataset.mvciRuntimeVersion)||VERSION,loader=clean(document.documentElement.dataset.mvciLoaderVersion)||'1.0.3';
    const icon=state.icon?`<img alt="" aria-hidden="true" draggable="false" src="${state.icon}">`:'★';
    const message=syncing?`Syncing Rebel Command · ${Math.min((q.index||0)+1,q.items?.length||0)}/${q.items?.length||0}${state.message?` · ${esc(state.message.replace(/^Syncing Rebel Command\s*·\s*\d+\/\d+\s*·\s*/,''))}`:''}`:(state.message||'Rebel Command decides what data is needed. Use Sync to collect all required data.');
    const plan=state.plan, summary=plan?.summary||{};
    const panel=state.open?`<div class="panel"><div class="head"><div class="headtext"><div class="title">Mission Vector <span style="font-size:11px;opacity:.8">${esc(runtime)}</span></div><div class="sub">Rebel Command data + approved actions</div></div><button id="mvci27-close" class="close">−</button></div><div class="body"><div class="info"><div><b>Michael Brion</b><br>Rebel Command · Scheduling / OT</div><div><span class="dot ${paired()?'':'off'}"></span>${paired()?'Connected':'Pairing needed'}</div></div><div class="actions"><button id="mvci27-sync" class="btn sync" ${state.busy&&!syncing?'disabled':''}>${syncing?`Syncing · ${Math.min((q.index||0)+1,q.items?.length||0)}/${q.items?.length||0}`:'Sync Rebel Command'}</button>${syncing?'<button id="mvci27-stop" class="btn secondary" style="grid-column:1/-1">Stop Sync</button>':''}<button id="mvci27-schedule" class="btn" ${state.busy?'disabled':''}>Apply Riding Plan${scheduleCount?` · ${scheduleCount}`:''}</button><button id="mvci27-ot" class="btn" ${state.busy?'disabled':''}>Sign Up for OT${otCount?` · ${otCount}`:''}</button></div><div class="status ${state.kind==='success'?'success':state.kind==='error'?'error':''}">${esc(message)}</div><div class="foot"><button id="mvci27-update" class="btn secondary">Update</button><button id="mvci27-settings" class="btn secondary">Settings</button><button id="mvci27-check" class="btn secondary" ${state.busy?'disabled':''}>Connection</button></div>${state.settings?`<div class="settings"><b>Loader:</b> ${esc(loader)} · <b>Runtime:</b> ${esc(runtime)}<br>${plan?`<b>History starts:</b> ${esc(plan.config?.trackingStartDate||'—')} · <b>Riding plan:</b> +${esc(plan.config?.scheduleHorizonDays||'—')}d · <b>OT:</b> +${esc(plan.config?.overtimeHorizonDays||'—')}d<br><b>Needed now:</b> ${esc(summary.total??'—')} checks (${esc(summary.staffing??0)} staffing / ${esc(summary.overtime??0)} OT priority)<br>`:''}<b>Vector writes:</b> locked until the approved preview → one manual write → reread proof is complete.</div>`:''}</div></div>`:'';
    root.innerHTML=`${panel}<button id="mvci27-orb" class="orb" title="Mission Vector">${icon}</button>`;
    root.querySelector('#mvci27-orb')?.addEventListener('click',async()=>{state.open=!state.open;if(state.open){try{await Promise.all([syncPlan(),refreshActions()]);}catch(_){}}render();});
    root.querySelector('#mvci27-close')?.addEventListener('click',()=>{state.open=false;render();});
    root.querySelector('#mvci27-sync')?.addEventListener('click',()=>syncing?runQueue():startSync(false));
    root.querySelector('#mvci27-stop')?.addEventListener('click',()=>stopSync(`Data sync stopped after ${q.index||0} of ${q.items?.length||0} checks.`));
    root.querySelector('#mvci27-schedule')?.addEventListener('click',()=>startNextAction('schedule'));
    root.querySelector('#mvci27-ot')?.addEventListener('click',()=>startNextAction('overtime_signup'));
    root.querySelector('#mvci27-update')?.addEventListener('click',()=>{const fn=window.MVCI_SCHEDULER_CHECK_UPDATE;if(typeof fn==='function')fn();else saveStatus('Update helper is not available yet. Refresh the page once.','error');});
    root.querySelector('#mvci27-settings')?.addEventListener('click',async()=>{state.settings=!state.settings;if(state.settings)try{await syncPlan();}catch(_){}render();});
    root.querySelector('#mvci27-check')?.addEventListener('click',checkConnection);
  }

  function suppressLegacy(){try{sessionStorage.setItem(LEGACY_AUTO_KEY,'1');}catch(_){}const old=window.MVCI_CONTROL_PANEL_0250;if(old?.status?.().range?.active)try{old.stopRangeSync();}catch(_){} }
  function mirrorLegacyStatus(){const legacy=loadJson(LEGACY_STATUS_KEY,{}),own=loadJson(STATUS_KEY,{});if((Number(legacy.at)||0)>(Number(own.at)||0)&&legacy.message){state.message=clean(legacy.message);state.kind=clean(legacy.kind)||'info';render();}}

  restoreStatus();suppressLegacy();render();loadIcon();
  setTimeout(async()=>{suppressLegacy();try{await Promise.all([syncPlan(),refreshActions()]);}catch(_){}render();const q=queue();if(q.active)runQueue();},1200);
  setTimeout(()=>{try{if(!sessionStorage.getItem(AUTO_KEY)){sessionStorage.setItem(AUTO_KEY,'1');if(!queue().active)startSync(true);}}catch(_){}},5000);
  setInterval(()=>{if(queue().active)pulseLock();mirrorLegacyStatus();},8000);
  window.addEventListener('hashchange',()=>setTimeout(()=>{if(queue().active)runQueue();},700));
  window.addEventListener('beforeunload',()=>{if(!queue().active)releaseLock();});

  window.MVCI_COMMAND_CENTER_0270={version:VERSION,startSync,stopSync,runQueue,startNextAction,status:()=>({paired:paired(),queue:queue(),plan:state.plan,actions:state.actions,message:state.message})};
})();
