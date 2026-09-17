(function(){
'use strict';
const VERSION='0.30.3-dev';
const EXPECTED_LOADER='1.0.5';
const ROOT_ID='mvci-command-center-v0290';
if(window.top!==window.self||window.MVCI_COMMAND_LOADER_UI_PATCH_0303)return;
window.MVCI_COMMAND_LOADER_UI_PATCH_0303={version:VERSION};
const loader=()=>String(document.documentElement.dataset.mvciLoaderVersion||window.__mvciLiveLoader?.loaderVersion||'').trim();
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
function patch(){
  if(loader()!==EXPECTED_LOADER)return;
  repairRuntimeIdentity();
  const root=document.getElementById(ROOT_ID);if(!root)return;
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
window.MVCI_COMMAND_LOADER_UI_PATCH_0303={version:VERSION,patch,status:()=>({loader:loader(),expected:EXPECTED_LOADER,runtime:window.__mvciLiveLoader?.runtimeVersion||''})};
})();