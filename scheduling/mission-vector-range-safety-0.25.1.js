(function () {
  'use strict';
  const VERSION='0.25.1-dev';
  const ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
  const PAIR_KEY='vectorStaffingCollectorPairing_v1';
  const AUTO_SESSION_KEY='mvciRangeAutoAttempted_v0250';
  const STATUS_KEY='mvciControlStatus_v0250';
  if(window.top!==window.self||window.__mvciRangeSafety0251)return;
  window.__mvciRangeSafety0251={version:VERSION,startedAt:Date.now()};
  const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
  function loadJson(k,f={}){try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch(_){return f}}
  function saveJson(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}}
  function pairing(){const p=loadJson(PAIR_KEY,{});return{deviceId:clean(p.deviceId),token:clean(p.token),endpoint:clean(p.endpoint)||ENDPOINT}}
  async function worklist(){const p=pairing();if(!p.deviceId||!p.token)return[];const r=await fetch(`${p.endpoint}?action=action-worklist`,{method:'GET',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId}});const b=await r.json().catch(()=>({}));return r.ok&&b?.ok!==false&&Array.isArray(b?.packages)?b.packages:[]}
  async function protectAutoSync(){try{if(sessionStorage.getItem(AUTO_SESSION_KEY))return;const packages=await worklist();if(!packages.length)return;sessionStorage.setItem(AUTO_SESSION_KEY,'1');saveJson(STATUS_KEY,{message:`Automatic range sync held because ${packages.length} Vector input package${packages.length===1?' is':'s are'} waiting. Complete or cancel the action first, then start Sync Past + Future Range manually.`,kind:'info',at:Date.now()})}catch(_){}}
  let sawActive=false,finished=false;
  async function watchCompletion(){const api=window.MVCI_CONTROL_PANEL_0250;if(!api?.status)return;const st=api.status(),q=st?.range||{};if(q.active){sawActive=true;finished=false;return}if(!sawActive||finished||!Array.isArray(q.results)||!q.results.length)return;finished=true;try{window.MVCI_VECTOR_RECONCILIATION_0211?.reconcile?.()}catch(_){}try{await window.MVCI_REBEL_CORE_SCHEDULING_SYNC_0210?.syncNow?.()}catch(_){} }
  protectAutoSync();
  setTimeout(protectAutoSync,700);
  setInterval(watchCompletion,1200);
})();