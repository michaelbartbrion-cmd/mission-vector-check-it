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
new MutationObserver(()=>patch()).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(patch,250);setTimeout(patch,1000);
// The assisted 0.30.0 module can rewrite shared identity after the original
// startup timers, even when the DOM does not mutate again. Re-check the exact
// pinned manifest identity periodically without restarting the loader,
// collecting data, changing assignments, or asserting loader completion.
setInterval(patch,2000);
window.MVCI_COMMAND_LOADER_UI_PATCH_0303={version:VERSION,patch,status:()=>({loader:loader(),expected:EXPECTED_LOADER,runtime:window.__mvciLiveLoader?.runtimeVersion||''})};
})();