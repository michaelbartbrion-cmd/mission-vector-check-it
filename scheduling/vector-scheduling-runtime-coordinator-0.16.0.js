(function(){
'use strict';
const VERSION='0.16.0-dev';
const STATE_KEY='missionVectorScheduling_v3';
if(window.top!==window.self||window.__mvciRuntimeCoordinator0160)return;
window.__mvciRuntimeCoordinator0160={version:VERSION,startedAt:Date.now()};
function ensureStyle(){
 let style=document.getElementById('vs-v0160-runtime-coordinator-style');
 if(!style){style=document.createElement('style');style.id='vs-v0160-runtime-coordinator-style';style.textContent='#vs-live-build-status-v0120,#vs-live-build-status-v0130{display:none!important}';document.documentElement.appendChild(style);}
}
function syncMetadata(){
 let s;try{s=JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(_){return;}if(!s)return;
 s.metadata=s.metadata||{};
 const runtime=window.__mvciLiveLoader?.runtimeVersion||VERSION;
 const loader=window.__mvciLiveLoader?.loaderVersion||s.metadata.liveLoaderVersion||null;
 const components={
  runtimeCoordinator:VERSION,
  baseReader:window.MVCI_VECTOR_READER_0120?.version||null,
  precisionReader:window.MVCI_VECTOR_READER_0160?.version||window.MVCI_VECTOR_READER_0150?.version||null,
  backfill:window.MVCI_VECTOR_BACKFILL_0130?.version||null,
  telemetry:window.MVCI_REBEL_CORE_TELEMETRY_0140?.version||null,
  precisionTelemetry:window.MVCI_REBEL_CORE_SEGMENTS_0150?.version||null,
  schedulingLedger:window.MVCI_REBEL_CORE_LEDGER_0150?.version||null,
  reconciliation:window.MVCI_VECTOR_RECONCILIATION_0150?.version||null,
 };
 const next=JSON.stringify(components);
 if(s.metadata.runtimeVersion===runtime&&s.metadata.liveLoaderVersion===loader&&JSON.stringify(s.metadata.componentVersions||{})===next)return;
 s.metadata.runtimeVersion=runtime;
 s.metadata.liveLoader=!!window.__mvciLiveLoader;
 s.metadata.liveLoaderVersion=loader;
 s.metadata.componentVersions=components;
 s.metadata.runtimeCoordinatorVersion=VERSION;
 s.metadata.runtimeLoadedAt=window.__mvciLiveLoader?.loadedAt||s.metadata.runtimeLoadedAt||new Date().toISOString();
 s.metadata.updatedAt=new Date().toISOString();
 localStorage.setItem(STATE_KEY,JSON.stringify(s));
}
function tick(){ensureStyle();syncMetadata();}
setInterval(tick,5000);setTimeout(tick,100); // Stable metadata only; do not rescan state ten times a second.
window.MVCI_VECTOR_RUNTIME_COORDINATOR_0160={version:VERSION,syncMetadata};
})();
