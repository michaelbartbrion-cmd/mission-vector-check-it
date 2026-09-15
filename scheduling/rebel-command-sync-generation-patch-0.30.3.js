(function(){
'use strict';
const VERSION='0.30.3-dev';
const DEFAULT_ENDPOINT='https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
const PAIR_KEY='vectorStaffingCollectorPairing_v1';
const QUEUE_KEY='mvciServerDrivenSync_v0290';
const AUTO_KEY='mvciServerDrivenAuto_v0290';
const GENERATION_KEY='mvciServerSyncPlanGeneration_v0303';
const BACKUP_KEY='mvciServerDrivenSyncGenerationBackup_v0303';
if(window.top!==window.self||window.MVCI_SYNC_GENERATION_PATCH_0303)return;
window.MVCI_SYNC_GENERATION_PATCH_0303={version:VERSION};
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
function load(k,f={}){try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch(_){return f}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}}
function pairing(){const p=load(PAIR_KEY,{});return{deviceId:clean(p.deviceId),token:clean(p.token),endpoint:clean(p.endpoint)||DEFAULT_ENDPOINT}}
function resetQueue(reason,generation,previous){const q=load(QUEUE_KEY,{});if(q?.active===true){save(BACKUP_KEY,{invalidatedAt:Date.now(),reason,generation,previous,startedAt:Number(q.startedAt||0),index:Number(q.index||0),itemCount:Array.isArray(q.items)?q.items.length:0,successCount:Array.isArray(q.successKeys)?q.successKeys.length:0,finalFailureCount:Array.isArray(q.finalFailures)?q.finalFailures.length:0});save(QUEUE_KEY,{...q,active:false,index:0,items:[],successKeys:[],finalFailures:[],attempts:{},navReloads:{},stoppedAt:Date.now(),invalidatedReason:reason})}try{sessionStorage.removeItem(AUTO_KEY)}catch(_){} }
async function reconcile(){const p=pairing();if(!p.deviceId||!p.token)return{ok:false,reason:'not_paired'};try{const r=await fetch(`${p.endpoint}?action=range-sync-plan`,{method:'GET',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${p.token}`,'X-Rebel-Device-ID':p.deviceId}});const b=await r.json().catch(()=>({}));if(!r.ok||b?.ok===false)throw new Error(clean(b?.error||`HTTP ${r.status}`));const generation=clean(b?.config?.syncPlanGeneration);if(!generation)return{ok:false,reason:'server_generation_missing'};const previous=clean(localStorage.getItem(GENERATION_KEY)||'');if(previous!==generation){resetQueue(`server_sync_generation:${previous||'none'}->${generation}`,generation,previous);localStorage.setItem(GENERATION_KEY,generation);console.info(`Mission Vector ${VERSION}: sync generation is ${generation}; stale browser queue state was invalidated if present.`)}return{ok:true,generation,previous,changed:previous!==generation}}catch(e){console.warn(`Mission Vector ${VERSION}: sync-generation check skipped.`,e);return{ok:false,reason:clean(e?.message||e)}}}
setTimeout(reconcile,900);
window.MVCI_SYNC_GENERATION_PATCH_0303={version:VERSION,reconcile,status:()=>({generation:clean(localStorage.getItem(GENERATION_KEY)||''),queue:load(QUEUE_KEY,{})})};
})();
