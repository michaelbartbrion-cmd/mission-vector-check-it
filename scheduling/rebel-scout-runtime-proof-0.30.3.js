(function(){
'use strict';
const VERSION='0.30.3-dev';
const EXPECTED_LOADER='1.0.5';
const ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const PAIR_KEY='vectorStaffingCollectorPairing_v1';
if(window.top!==window.self||window.MVCI_RUNTIME_PROOF_0303)return;
window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'pending'};
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const load=(key,f={})=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):f}catch(_){return f}};
const pairing=()=>{const p=load(PAIR_KEY,{});return{deviceId:clean(p.deviceId),token:clean(p.token),endpoint:clean(p.endpoint)||ENDPOINT}};
async function report(){
  const loader=window.__mvciLiveLoader||{};
  const loaderVersion=clean(loader.loaderVersion||document.documentElement.dataset.mvciLoaderVersion||'');
  const runtimeVersion=clean(loader.runtimeVersion||document.documentElement.dataset.mvciRuntimeVersion||'');
  const failures=Array.isArray(loader.failures)?loader.failures:[];
  const complete=loader.complete===true;
  const generationGuard=window.MVCI_SYNC_GENERATION_PATCH_0303;
  const p=pairing();
  if(!p.deviceId||!p.token){window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'not_paired'};return false}
  if(loaderVersion!==EXPECTED_LOADER||runtimeVersion!==VERSION||!complete||failures.length||generationGuard?.version!==VERSION){
    window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'not_proven',loaderVersion,runtimeVersion,complete,failures:failures.length,generationGuard:clean(generationGuard?.version)};
    console.warn(`Mission Vector ${VERSION}: runtime proof withheld because the loader/runtime set is incomplete or mismatched.`,window.MVCI_RUNTIME_PROOF_0303);
    return false;
  }
  const generationResult=typeof generationGuard.reconcile==='function'?await generationGuard.reconcile():{ok:false,reason:'generation_guard_unavailable'};
  if(!generationResult?.ok){
    window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'generation_unverified',loaderVersion,runtimeVersion,reason:clean(generationResult?.reason)};
    console.warn(`Mission Vector ${VERSION}: runtime proof withheld because sync-generation reconciliation did not succeed.`,generationResult);
    return false;
  }
  const occurredAt=new Date().toISOString();
  const payload={scoutDiagnostic:{
    diagnosticId:`runtimeproof:${p.deviceId}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
    runtimeVersion:VERSION,
    kind:'checkpoint',
    actionType:'runtime_boot',
    message:`Scheduling runtime ${VERSION} loaded through loader ${EXPECTED_LOADER} with zero loader failures and reconciled sync generation ${clean(generationResult.generation)}.`,
    pageUrl:location.href,
    pagePath:location.pathname,
    pageHash:location.hash,
    stage:'runtime_loaded',
    occurredAt,
    snapshot:{loaderVersion,runtimeVersion,complete,loadedScriptCount:Array.isArray(loader.loadedScripts)?loader.loadedScripts.length:0,loaderFailures:failures.length,syncGeneration:clean(generationResult.generation),generationChanged:generationResult.changed===true,generationPrevious:clean(generationResult.previous)}
  }};
  try{
    const r=await fetch(p.endpoint||ENDPOINT,{method:'POST',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const b=await r.json().catch(()=>({}));
    const ok=r.ok&&b?.ok!==false&&b?.scoutDiagnostic?.accepted!==false;
    window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:ok?'reported':'report_failed',loaderVersion,runtimeVersion,generation:clean(generationResult.generation),httpStatus:r.status};
    if(ok)console.info(`Mission Vector ${VERSION}: live runtime proof reported.`);else console.warn(`Mission Vector ${VERSION}: runtime proof report was not accepted.`,b);
    return ok;
  }catch(e){
    window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'report_error',loaderVersion,runtimeVersion,generation:clean(generationResult.generation),reason:clean(e?.message||e)};
    console.warn(`Mission Vector ${VERSION}: runtime proof report failed.`,e);
    return false;
  }
}
setTimeout(report,1200);
window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'scheduled',report};
})();
