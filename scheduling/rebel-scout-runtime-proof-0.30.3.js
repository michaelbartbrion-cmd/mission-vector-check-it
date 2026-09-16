(function(){
'use strict';
const VERSION='0.30.3-dev';
const EXPECTED_LOADER='1.0.5';
const ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const PAIR_KEY='vectorStaffingCollectorPairing_v1';
const MAX_ATTEMPTS=6;
const RETRY_MS=2500;
if(window.top!==window.self||window.MVCI_RUNTIME_PROOF_0303)return;
window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'pending',attempts:0};
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const load=(key,f={})=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):f}catch(_){return f}};
const pairing=()=>{const p=load(PAIR_KEY,{});return{deviceId:clean(p.deviceId),token:clean(p.token),endpoint:clean(p.endpoint)||ENDPOINT}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const proofKey=(deviceId,loader)=>`runtimeproof:${deviceId}:${VERSION}:${clean(loader?.loadedAt||'session').replace(/[^a-zA-Z0-9_.:-]/g,'_')}`.slice(0,220);

async function reportOnce(attempt){
  const loader=window.__mvciLiveLoader||{};
  const loaderVersion=clean(loader.loaderVersion||document.documentElement.dataset.mvciLoaderVersion||'');
  const runtimeVersion=clean(loader.runtimeVersion||document.documentElement.dataset.mvciRuntimeVersion||'');
  const failures=Array.isArray(loader.failures)?loader.failures:[];
  const complete=loader.complete===true;
  const generationGuard=window.MVCI_SYNC_GENERATION_PATCH_0303;
  const p=pairing();
  const base={version:VERSION,attempts:attempt,loaderVersion,runtimeVersion,complete,failures:failures.length,generationGuard:clean(generationGuard?.version)};

  if(!p.deviceId||!p.token){window.MVCI_RUNTIME_PROOF_0303={...base,status:'not_paired'};return{ok:false,retry:true,reason:'not_paired'}}
  if(loaderVersion!==EXPECTED_LOADER||runtimeVersion!==VERSION||!complete||failures.length||generationGuard?.version!==VERSION){
    const retry=!complete&&attempt<MAX_ATTEMPTS;
    window.MVCI_RUNTIME_PROOF_0303={...base,status:'not_proven',retry};
    console.warn(`Mission Vector ${VERSION}: runtime proof withheld because the loader/runtime set is incomplete or mismatched.`,window.MVCI_RUNTIME_PROOF_0303);
    return{ok:false,retry,reason:'runtime_not_proven'};
  }

  const generationResult=typeof generationGuard.reconcile==='function'?await generationGuard.reconcile():{ok:false,reason:'generation_guard_unavailable'};
  if(!generationResult?.ok){
    window.MVCI_RUNTIME_PROOF_0303={...base,status:'generation_unverified',reason:clean(generationResult?.reason)};
    console.warn(`Mission Vector ${VERSION}: runtime proof withheld because sync-generation reconciliation did not succeed.`,generationResult);
    return{ok:false,retry:attempt<MAX_ATTEMPTS,reason:'generation_unverified'};
  }

  const occurredAt=new Date().toISOString();
  const diagnosticId=proofKey(p.deviceId,loader);
  const payload={scoutDiagnostic:{
    diagnosticId,
    runtimeVersion:VERSION,
    kind:'checkpoint',
    actionType:'runtime_boot',
    message:`Scheduling runtime ${VERSION} loaded through loader ${EXPECTED_LOADER} with zero loader failures and reconciled sync generation ${clean(generationResult.generation)}.`,
    pageUrl:location.href,
    pagePath:location.pathname,
    pageHash:location.hash,
    stage:'runtime_loaded',
    occurredAt,
    snapshot:{loaderVersion,runtimeVersion,complete,loadedScriptCount:Array.isArray(loader.loadedScripts)?loader.loadedScripts.length:0,loaderFailures:failures.length,syncGeneration:clean(generationResult.generation),generationChanged:generationResult.changed===true,generationPrevious:clean(generationResult.previous),attempt}
  }};
  try{
    const r=await fetch(p.endpoint||ENDPOINT,{method:'POST',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const b=await r.json().catch(()=>({}));
    const accepted=r.ok&&b?.ok!==false&&b?.scoutDiagnostic?.accepted!==false;
    const duplicate=b?.scoutDiagnostic?.duplicate===true;
    const ok=accepted||duplicate;
    window.MVCI_RUNTIME_PROOF_0303={...base,status:ok?'reported':'report_failed',generation:clean(generationResult.generation),httpStatus:r.status,diagnosticId,duplicate};
    if(ok)console.info(`Mission Vector ${VERSION}: live runtime proof ${duplicate?'already recorded':'reported'}.`);else console.warn(`Mission Vector ${VERSION}: runtime proof report was not accepted.`,b);
    return{ok,retry:!ok&&attempt<MAX_ATTEMPTS,reason:ok?'reported':'report_failed'};
  }catch(e){
    window.MVCI_RUNTIME_PROOF_0303={...base,status:'report_error',generation:clean(generationResult.generation),diagnosticId,reason:clean(e?.message||e)};
    console.warn(`Mission Vector ${VERSION}: runtime proof report failed.`,e);
    return{ok:false,retry:attempt<MAX_ATTEMPTS,reason:'report_error'};
  }
}

async function report(){
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    const result=await reportOnce(attempt);
    if(result.ok||!result.retry)return result.ok;
    await wait(RETRY_MS);
  }
  return false;
}

setTimeout(report,500);
window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'scheduled',attempts:0,report};
})();
