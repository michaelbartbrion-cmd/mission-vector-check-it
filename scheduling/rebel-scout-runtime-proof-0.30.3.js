(function(){
'use strict';
const VERSION='0.30.3-dev';
const EXPECTED_LOADER='1.0.5';
const EXPECTED_SCRIPT_COUNT=27; // Pinned vector-scheduling-runtime-manifest-0.30.3.json, not an arbitrary threshold.
const ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const PAIR_KEY='vectorStaffingCollectorPairing_v1';
const MAX_ATTEMPTS=6;
const RETRY_MS=2500;
if(window.top!==window.self||window.MVCI_RUNTIME_PROOF_0303)return;
const BOOT_ID=`${new Date().toISOString()}-${Math.random().toString(36).slice(2,10)}`;
window.MVCI_RUNTIME_PROOF_0303={version:VERSION,status:'pending',attempts:0};
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const load=(key,f={})=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):f}catch(_){return f}};
const pairing=()=>{const p=load(PAIR_KEY,{});return{deviceId:clean(p.deviceId),token:clean(p.token),endpoint:clean(p.endpoint)||ENDPOINT}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const proofKey=deviceId=>`runtimeproof:${deviceId}:${VERSION}:${BOOT_ID}`.slice(0,220);

function loaderEvidence(){
  const meta=window.__mvciLiveLoader;
  const dom=document.documentElement.dataset;
  // The Tampermonkey GM_xmlhttpRequest loader may live in an isolated world:
  // its window properties are invisible to page-world diagnostics, but its DOM
  // attributes are shared. Never treat an inaccessible .complete as false proof
  // of a broken loader, or simply set complete=true without independent evidence.
  const objectAvailable=!!(meta&&clean(meta.loaderVersion));
  const loaderVersion=clean(objectAvailable?meta.loaderVersion:dom.mvciLoaderVersion);
  const observedRuntime=clean(objectAvailable?meta.runtimeVersion:dom.mvciRuntimeVersion);
  const loadedCount=objectAvailable&&Array.isArray(meta.loadedScripts)?meta.loadedScripts.length:Number(dom.mvciLoaderLoaded);
  const failures=objectAvailable&&Array.isArray(meta.failures)?meta.failures.length:Number(dom.mvciLoaderFailures);
  const manifestPinned=loaderVersion===EXPECTED_LOADER&&(!objectAvailable||/vector-scheduling-runtime-manifest-0\.30\.3\.json(?:\?|$)/.test(String(meta.manifestUrl||'')));
  const allScriptsSuccessful=Number.isInteger(loadedCount)&&loadedCount===EXPECTED_SCRIPT_COUNT&&failures===0;
  // Loader 1.0.5 validates the hard-pinned 0.30.3 manifest before fetching its
  // 27 scripts, and only increases mvciLoaderLoaded after successful execution.
  // If its object is inaccessible, 27/27 + 0 failures is the shared-DOM
  // completion evidence; if it IS accessible, require its explicit complete.
  const complete=objectAvailable?meta.complete===true:(manifestPinned&&allScriptsSuccessful);
  const knownLegacyCollision=observedRuntime==='0.30.0-dev'&&dom.mvciAssistedVersion==='0.30.0-dev'&&window.MVCI_COMMAND_LOADER_UI_PATCH_0303?.version===VERSION;
  const runtimeMatched=observedRuntime===VERSION||knownLegacyCollision;
  return {loaderVersion,observedRuntime,loadedCount,failures,complete,objectAvailable,manifestPinned,allScriptsSuccessful,knownLegacyCollision,runtimeMatched,completionSource:objectAvailable?'loader_object_complete':'pinned_manifest_dom_27_of_27'};
}

async function reportOnce(attempt){
  const evidence=loaderEvidence();
  const generationGuard=window.MVCI_SYNC_GENERATION_PATCH_0303;
  const p=pairing();
  const base={version:VERSION,attempts:attempt,loaderVersion:evidence.loaderVersion,runtimeVersion:evidence.observedRuntime,complete:evidence.complete,failures:evidence.failures,loadedScripts:evidence.loadedCount,generationGuard:clean(generationGuard?.version),completionSource:evidence.completionSource,knownLegacyCollision:evidence.knownLegacyCollision};

  if(!p.deviceId||!p.token){window.MVCI_RUNTIME_PROOF_0303={...base,status:'not_paired'};return{ok:false,retry:attempt<MAX_ATTEMPTS,reason:'not_paired'}}
  if(!evidence.manifestPinned||!evidence.runtimeMatched||!evidence.complete||!evidence.allScriptsSuccessful||generationGuard?.version!==VERSION){
    // Do not infer completeness from mere presence of a panel/module. Never
    // clear failure counters or bypass sync-generation verification.
    const retry=attempt<MAX_ATTEMPTS&&evidence.failures===0;
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
  const diagnosticId=proofKey(p.deviceId);
  const payload={scoutDiagnostic:{
    diagnosticId,
    runtimeVersion:VERSION,
    kind:'checkpoint',
    actionType:'runtime_boot',
    message:`Scheduling runtime ${VERSION}: pinned loader ${EXPECTED_LOADER}, ${EXPECTED_SCRIPT_COUNT} scripts loaded with zero failures, ${evidence.completionSource}, sync generation ${clean(generationResult.generation)} reconciled.`,
    pageUrl:location.href,
    pagePath:location.pathname,
    pageHash:location.hash,
    stage:'runtime_loaded',
    occurredAt,
    snapshot:{loaderVersion:evidence.loaderVersion,runtimeVersion:VERSION,observedRuntimeVersion:evidence.observedRuntime,legacyIdentityCollision:evidence.knownLegacyCollision,complete:evidence.complete,completionSource:evidence.completionSource,loadedScriptCount:evidence.loadedCount,expectedScriptCount:EXPECTED_SCRIPT_COUNT,loaderFailures:evidence.failures,syncGeneration:clean(generationResult.generation),generationChanged:generationResult.changed===true,generationPrevious:clean(generationResult.previous),attempt}
  }};
  try{
    const r=await fetch(p.endpoint||ENDPOINT,{method:'POST',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const b=await r.json().catch(()=>({}));
    const ack=b?.scoutDiagnostic;
    const duplicate=ack?.duplicate===true;
    const ok=r.ok&&b?.ok===true&&ack?.accepted===true&&clean(ack?.diagnosticId)===diagnosticId;
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
