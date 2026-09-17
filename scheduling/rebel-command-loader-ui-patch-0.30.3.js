(function(){
'use strict';
const VERSION='0.30.3-dev';
const EXPECTED_LOADER='1.0.5';
const ROOT_ID='mvci-command-center-v0290';
const VERIFY_ID='rs0303-verify-modal';
if(window.top!==window.self||window.MVCI_COMMAND_LOADER_UI_PATCH_0303)return;
window.MVCI_COMMAND_LOADER_UI_PATCH_0303={version:VERSION};
const loader=()=>String(document.documentElement.dataset.mvciLoaderVersion||window.__mvciLiveLoader?.loaderVersion||'').trim();
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
let lastVerification=null;
function repairRuntimeIdentity(){
  const meta=window.__mvciLiveLoader;
  // The pinned loader validates its versioned manifest before boot. Do not alter
  // the identity of another loader, an unknown manifest, or a failed boot.
  if(!meta||meta.loaderVersion!==EXPECTED_LOADER||!/vector-scheduling-runtime-manifest-0\.30\.3\.json(?:\?|$)/.test(String(meta.manifestUrl||''))||meta.runtimeVersion==='boot-error')return;
  // The legacy assisted-input module reports its OWN 0.30.0 module version by
  // overwriting the shared manifest identity on every DOM mutation. Restore
  // only this known collision; never clear loader failures or set complete.
  if(meta.runtimeVersion==='0.30.0-dev'&&window.REBEL_SCOUT_ASSISTED_0300?.version==='0.30.0-dev')meta.runtimeVersion=VERSION;
  if(meta.runtimeVersion===VERSION&&document.documentElement.dataset.mvciRuntimeVersion!==VERSION)document.documentElement.dataset.mvciRuntimeVersion=VERSION;
}
function showVerification(msg,ok){
  const el=document.getElementById('rs0300-status');
  if(el){el.textContent=msg;el.style.color=ok?'#17643a':'#9b1c1c';}
  console[ok?'info':'warn'](`Mission Vector ${VERSION}: ${msg}`);
}
function verifyTraceModal(){
  // Purely read DOM and trace state. Never alter CrewSense fields, locks or Save.
  const api=window.REBEL_SCOUT_ASSISTED_0300;
  const fail=reason=>{lastVerification={ok:false,reason,at:new Date().toISOString()};showVerification(`STOPPED: ${reason} Close the modal and CANCEL / RELEASE LOCK.`,false);return lastVerification;};
  if(loader()!==EXPECTED_LOADER||!api||typeof api.status!=='function')return fail('Scout runtime is not available.');
  const {state,trace}=api.status();
  const t=trace?.target;
  if(!t||trace.tracePatch!=='2026-09-16-trace-only'||!Number.isFinite(trace.at)||Date.now()-trace.at>600000||trace.at>Date.now()||state?.armed)return fail('A fresh exact-person trace is required.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(state.date)||trace.date!==state.date||trace.person!==state.person||trace.role!==state.role||t.date!==state.date||t.personName!==state.person||t.unit!=='Truck 504')return fail('Trace target and current selection disagree.');
  if(location.hash!==`#${state.date}`||!/\/Application\/ControlPanel\/Schedule\/?$/i.test(location.pathname))return fail('Scheduler URL and selected date disagree.');
  const rows=[...document.querySelectorAll('.fc-event-user[data-shift-user-id][data-user-id][data-date]')].filter(r=>r.dataset.shiftUserId===String(t.shiftUserId));
  if(rows.length!==1)return fail('The exact assignment row is missing or duplicated; the roster may have changed.');
  const row=rows[0],group=row.closest('.fc-event-shift[data-id][data-date]');
  const name=clean(row.querySelector('.fc-event-user-name')?.textContent);
  const role=clean(row.textContent).replace(name,'').trim();
  if(!group||name!==t.personName||row.dataset.userId!==String(t.userId)||row.dataset.date!==t.date||group.dataset.date!==t.date||group.dataset.id!==String(t.assignmentId)||!/^Truck\s*504\b/i.test(clean(group.textContent))||role!==t.observedRole||String(row.dataset.qualifierid||'')!==String(t.qualifierId||''))return fail('The live person, apparatus, date, role, or assignment ID changed since the click.');
  const dlg=document.getElementById('shift-users-dialog');
  const form=dlg?.querySelector('#shift-user-form');
  const title=clean(document.getElementById('ui-dialog-title-shift-users-dialog')?.textContent);
  const expectedDay=new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${state.date}T12:00:00Z`));
  if(!dlg||!form||!dlg.isConnected||!/Truck\s*504\b/i.test(title)||!title.includes(expectedDay))return fail('The expected Truck 504 editing modal and date are not visible.');
  const read=name=>clean(form.querySelector(`input[name="${name}"]`)?.value);
  const shiftUsersId=read('shift_users_id'),shiftId=read('shift_id'),date=read('date');
  if(!shiftUsersId||!shiftId||!date||shiftUsersId!==String(t.shiftUserId)||shiftId!==String(t.assignmentId)||date!==state.date)return fail('CrewSense modal form IDs or date differ from the captured row.');
  lastVerification={ok:true,at:new Date().toISOString(),date,person:name,unit:'Truck 504',role,shiftUsersId,shiftId,qualifierId:String(t.qualifierId||''),readOnly:true};
  showVerification(`READ-ONLY MATCH: ${name}, Truck 504, ${date}, ${role}; exact row and modal IDs agree. Close the CrewSense modal, then CANCEL / RELEASE LOCK. NO Prepare or Save.`,true);
  api.diagnostic?.('checkpoint','modal_identity_verified','Read-only trace/modal identity matched. No fields prepared or saved.',{identityVerification:lastVerification}).catch(()=>{});
  return lastVerification;
}
function ensureVerifyButton(){
  const panel=document.getElementById('rebel-scout-assisted-v0300');
  if(!panel||document.getElementById(VERIFY_ID))return;
  const trace=panel.querySelector('#rs0300-trace');if(!trace)return;
  const button=document.createElement('button');
  button.type='button';button.id=VERIFY_ID;
  button.textContent='VERIFY OPEN MODAL - READ ONLY';
  button.style.cssText='width:100%;min-height:36px;margin-top:6px;background:#19643d;color:white;border:0;border-radius:6px;font-weight:800';
  button.addEventListener('click',verifyTraceModal);
  trace.insertAdjacentElement('afterend',button);
}
function polishScout(){
  // Presentation only: keep exact IDs, listeners, lock guards and verification intact.
  const p=document.getElementById('rebel-scout-assisted-v0300');
  if(!p||p.dataset.mvciScoutPolished==='1')return;
  p.dataset.mvciScoutPolished='1';
  const header=p.firstElementChild;if(header)header.textContent='REBEL SCOUT · READ-ONLY';
  const notice=p.querySelector('div[style*="#fff8e8"]');if(notice)notice.textContent='READ ONLY · No CrewSense assignments, fields, or saves are changed by these controls.';
  const prep=p.querySelector('#rs0300-prepare');if(prep){prep.disabled=true;prep.hidden=true;prep.style.display='none';}
  const label=(id,name)=>{const el=p.querySelector('#'+id);if(el)el.setAttribute('aria-label',name);return el;};
  label('rs0300-date','CrewSense schedule date');label('rs0300-person','Person');label('rs0300-role','Proposed role (trace reference only)');
  const open=label('rs0300-open','Open CrewSense date with full reload');if(open)open.textContent='OPEN DATE';
  const trace=label('rs0300-trace','Arm exact-person read-only trace');if(trace)trace.textContent='1 · ARM TRACE';
  const verify=label(VERIFY_ID,'Verify opened CrewSense modal without writing');if(verify)verify.textContent='2 · VERIFY MODAL · READ ONLY';
  const cancel=label('rs0300-cancel','Cancel and release the collection lock');if(cancel)cancel.textContent='CANCEL · RELEASE LOCK';
  label('rs0300-kill','Emergency kill switch for all assisted writes');
  const style=document.createElement('style');style.id='mvci-scout-polish-style';
  style.textContent='#rebel-scout-assisted-v0300{border:1px solid #806a44!important;border-radius:10px!important;background:#f7f2e8!important;color:#2b2923!important;padding:12px!important;font:12px/1.4 Arial,sans-serif!important;box-shadow:0 4px 14px #15151520}#rebel-scout-assisted-v0300 input,#rebel-scout-assisted-v0300 select,#rebel-scout-assisted-v0300 button{border:1px solid #a49b89;border-radius:6px;padding:6px;box-sizing:border-box;font:inherit}#rebel-scout-assisted-v0300 button{cursor:pointer;font-weight:700}#rebel-scout-assisted-v0300 button:disabled{cursor:not-allowed;opacity:.55}#rebel-scout-assisted-v0300 #rs0300-open{background:#e6d0a5;color:#332314;font-weight:800}#rebel-scout-assisted-v0300 #rs0300-trace{background:#354152;color:#fff}#rebel-scout-assisted-v0300 #rs0303-verify-modal{background:#17643e;color:#fff}#rebel-scout-assisted-v0300 #rs0300-cancel{background:#fff}#rebel-scout-assisted-v0300 #rs0300-kill{background:#fff2f0;color:#9b1c1c}#rebel-scout-assisted-v0300 #rs0300-status{font-size:11px;line-height:1.5;overflow-wrap:anywhere}';
  p.appendChild(style);
}
function patch(){
  if(loader()!==EXPECTED_LOADER)return;
  repairRuntimeIdentity();
  const root=document.getElementById(ROOT_ID);if(!root)return;
  ensureVerifyButton();
  polishScout();
  const update=root.querySelector('#mvci29-update');
  if(update&&update.textContent!=='Update')update.textContent='Update';
  const settings=root.querySelector('.settings');
  if(settings){
    const walker=document.createTreeWalker(settings,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(String(node.nodeValue||'').includes('Loader update recommended: 1.0.4 removes the old top-right startup text.')){
        node.nodeValue=String(node.nodeValue||'').replace('Loader update recommended: 1.0.4 removes the old top-right startup text.','Loader 1.0.5 is current.');
      }
    }
  }
}
document.addEventListener('click',ev=>{
  const btn=ev.target?.closest?.('#mvci29-update');
  if(!btn||loader()!==EXPECTED_LOADER)return;
  ev.preventDefault();ev.stopImmediatePropagation();
  try{window.MVCI_SCHEDULER_CHECK_UPDATE?.()}catch(e){console.warn(`Mission Vector ${VERSION}: update check failed.`,e)}
},true);
// CrewSense's scheduler uses a hash. Assigning #YYYY-MM-DD only changes the
// address bar in the existing document; it does not reliably load that day.
// Capture the date-button click before the older assisted handler and force ONE
// real document reload, retaining the sync/lock boundary and never editing data.
document.addEventListener('click',ev=>{
  const btn=ev.target?.closest?.('#rs0300-open');
  if(!btn||loader()!==EXPECTED_LOADER)return;
  ev.preventDefault();ev.stopImmediatePropagation();
  const status=()=>document.getElementById('rs0300-status');
  const say=message=>{const el=status();if(el)el.textContent=message;};
  try{
    const date=String(document.getElementById('rs0300-date')?.value||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)throw new Error('Invalid date; no navigation.');
    const parse=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch(_){throw new Error('Cannot read safety state; no navigation.')}};
    const sync=parse('mvciServerDrivenSync_v0290'),lock=parse('mvciDataSyncOwner_v0290');
    if(sync.active===true||Number(lock.expiresAt||0)>Date.now())throw new Error('Sync or assignment lock active; no navigation.');
    const url=`${location.origin}/Application/ControlPanel/Schedule/#${date}`;
    say(`Reloading Crew Scheduler for ${date}. Confirm the visible heading before arming trace.`);
    if(!/^\/Application\/ControlPanel\/Schedule\/?$/i.test(location.pathname)){location.assign(url);return;}
    history.replaceState(history.state,'',url);
    location.reload();
  }catch(e){say(`STOPPED: ${String(e?.message||e)} Do not arm trace.`);}
},true);
new MutationObserver(()=>patch()).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(patch,250);setTimeout(patch,1000);
// The assisted 0.30.0 module can rewrite shared identity after the original
// startup timers, even when the DOM does not mutate again. Re-check the exact
// pinned manifest identity periodically without restarting the loader,
// collecting data, changing assignments, or asserting loader completion.
setInterval(patch,2000);
window.MVCI_COMMAND_LOADER_UI_PATCH_0303={version:VERSION,patch,verifyTraceModal,status:()=>({loader:loader(),expected:EXPECTED_LOADER,runtime:window.__mvciLiveLoader?.runtimeVersion||'',lastVerification})};
})();