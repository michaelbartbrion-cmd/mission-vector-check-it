(function(){
'use strict';
const VERSION='0.30.2-dev';
const QUEUE_KEY='mvciServerDrivenSync_v0290';
const AUTO_KEY='mvciServerDrivenAuto_v0290';
const BACKUP_KEY='mvciServerDrivenSyncEpochBackup_v0302';
// Queue epoch is intentionally newer than the staffing-data revision. It does NOT invalidate
// fresh server evidence. It only forces a browser queue created before this repair to ask
// Rebel Command for a new worklist, so the server can decide which dates still need rereads.
const QUEUE_EPOCH=Date.parse('2026-09-15T21:40:00Z');
if(window.top!==window.self||window.MVCI_SYNC_EPOCH_PATCH_0302)return;
window.MVCI_SYNC_EPOCH_PATCH_0302={version:VERSION,queueEpoch:new Date(QUEUE_EPOCH).toISOString()};
function load(k,f={}){try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch(_){return f}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}}
try{
  const q=load(QUEUE_KEY,{}),started=Number(q?.startedAt||0);
  if(q?.active===true&&started>0&&started<QUEUE_EPOCH){
    save(BACKUP_KEY,{invalidatedAt:Date.now(),queueEpoch:QUEUE_EPOCH,startedAt:started,index:Number(q.index||0),itemCount:Array.isArray(q.items)?q.items.length:0,successCount:Array.isArray(q.successKeys)?q.successKeys.length:0,finalFailureCount:Array.isArray(q.finalFailures)?q.finalFailures.length:0});
    save(QUEUE_KEY,{...q,active:false,index:0,items:[],successKeys:[],finalFailures:[],attempts:{},navReloads:{},stoppedAt:Date.now(),invalidatedReason:'sync_queue_epoch_2026-09-15T21:40:00Z'});
    try{sessionStorage.removeItem(AUTO_KEY)}catch(_){}
    console.info(`Mission Vector ${VERSION}: discarded a stale browser sync queue. Fresh server evidence was retained; Rebel Command will decide the new worklist.`);
  }
}catch(e){console.warn(`Mission Vector ${VERSION}: queue epoch check skipped.`,e)}
})();
