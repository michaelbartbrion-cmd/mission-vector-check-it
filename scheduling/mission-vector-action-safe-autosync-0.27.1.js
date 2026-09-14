(function(){
  'use strict';
  const VERSION='0.27.1-dev';
  const AUTO_KEY='mvciServerDrivenAuto_v0270';
  const PAIR_KEY='vectorStaffingCollectorPairing_v1';
  const ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  if(window.top!==window.self||window.MVCI_ACTION_SAFE_AUTOSYNC_0271)return;
  try{sessionStorage.setItem(AUTO_KEY,'1');}catch(_){}
  const clean=v=>String(v==null?'':v).trim();
  function loadJson(k,f={}){try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch(_){return f}}
  function pairing(){const p=loadJson(PAIR_KEY,{});return{deviceId:clean(p.deviceId),token:clean(p.token),endpoint:clean(p.endpoint)||ENDPOINT}}
  async function worklist(){const p=pairing();if(!p.deviceId||!p.token)return[];const r=await fetch(`${p.endpoint}?action=action-worklist`,{cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId}});const b=await r.json().catch(()=>({}));return r.ok&&Array.isArray(b?.packages)?b.packages:[]}
  async function safeAuto(){try{const pending=await worklist();if(pending.length){console.info(`Mission Vector ${VERSION}: automatic data sync held because ${pending.length} approved/writing action package(s) are pending.`);return}window.MVCI_COMMAND_CENTER_0270?.startSync?.(true);}catch(e){console.warn(`Mission Vector ${VERSION}: automatic sync safety check failed.`,e)}}
  document.addEventListener('click',async e=>{
    const button=e.target?.closest?.('#mvci27-sync');
    if(!button)return;
    const status=window.MVCI_COMMAND_CENTER_0270?.status?.();
    if(status?.queue?.active)return;
    e.preventDefault();e.stopImmediatePropagation();
    try{const pending=await worklist();if(pending.length){alert(`Mission Vector data sync is held because ${pending.length} approved or in-progress Vector action${pending.length===1?' is':'s are'} waiting. Finish or cancel the action work in Rebel Command first so the browser is not navigated away during an input/verification sequence.`);return}window.MVCI_COMMAND_CENTER_0270?.startSync?.(false);}catch(err){alert(`Mission Vector could not check the action queue.\n\n${err?.message||err}`)}
  },true);
  setTimeout(safeAuto,5200);
  window.MVCI_ACTION_SAFE_AUTOSYNC_0271={version:VERSION,safeAuto};
})();
