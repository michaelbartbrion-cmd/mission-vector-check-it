(function(){
'use strict';
const VERSION='0.30.3-dev';
const EXPECTED_LOADER='1.0.5';
const ROOT_ID='mvci-command-center-v0290';
if(window.top!==window.self||window.MVCI_COMMAND_LOADER_UI_PATCH_0303)return;
window.MVCI_COMMAND_LOADER_UI_PATCH_0303={version:VERSION};
const loader=()=>String(document.documentElement.dataset.mvciLoaderVersion||window.__mvciLiveLoader?.loaderVersion||'').trim();
function patch(){
  if(loader()!==EXPECTED_LOADER)return;
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
window.MVCI_COMMAND_LOADER_UI_PATCH_0303={version:VERSION,patch,status:()=>({loader:loader(),expected:EXPECTED_LOADER})};
})();
