(function(){
'use strict';
const VERSION='0.29.8-dev';
if(window.top!==window.self||window.REBEL_SCOUT_SELECT2_PATCH_0298)return;
window.REBEL_SCOUT_SELECT2_PATCH_0298={version:VERSION};
const mark=()=>{
  const dlg=document.querySelector('#shift-users-dialog,.ui-dialog[role="dialog"],.ui-dialog-content');
  if(!dlg)return;
  dlg.querySelectorAll('select.select2-hidden-accessible').forEach(sel=>{
    if(sel.dataset.rebelScoutVisibleBridge==='1')return;
    sel.dataset.rebelScoutVisibleBridge='1';
    sel.style.position='absolute';
    sel.style.left='-10000px';
    sel.style.top='0';
    sel.style.width='1px';
    sel.style.height='1px';
    sel.style.opacity='0.001';
    sel.style.display='block';
    sel.style.visibility='visible';
    sel.style.pointerEvents='none';
  });
};
mark();
new MutationObserver(mark).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
try{document.documentElement.dataset.mvciRuntimeVersion=VERSION}catch(_){ }
})();
