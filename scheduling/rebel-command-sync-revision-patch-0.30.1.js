(function(){
'use strict';
const VERSION='0.30.1-dev';
const QUEUE_KEY='mvciServerDrivenSync_v0290';
const AUTO_KEY='mvciServerDrivenAuto_v0290';
const BACKUP_KEY='mvciServerDrivenSyncRevisionBackup_v0301';
const REVISION_AT=Date.parse('2026-09-15T17:55:00Z');
if(window.top!==window.self||window.MVCI_SYNC_REVISION_PATCH_0301)return;
window.MVCI_SYNC_REVISION_PATCH_0301={version:VERSION,revisionAt:new Date(REVISION_AT).toISOString()};
function load(k,f={}){try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch(_){return f}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}}
try{
  const q=load(QUEUE_KEY,{}),started=Number(q?.startedAt||0);
  if(q?.active===true&&started>0&&started<REVISION_AT){
    save(BACKUP_KEY,{invalidatedAt:Date.now(),revisionAt:REVISION_AT,startedAt:started,index:Number(q.index||0),itemCount:Array.isArray(q.items)?q.items.length:0,successCount:Array.isArray(q.successKeys)?q.successKeys.length:0,finalFailureCount:Array.isArray(q.finalFailures)?q.finalFailures.length:0});
    save(QUEUE_KEY,{...q,active:false,index:0,items:[],successKeys:[],finalFailures:[],attempts:{},navReloads:{},stoppedAt:Date.now(),invalidatedReason:'staffing_rule_revision_2026-09-15T17:55:00Z'});
    try{sessionStorage.removeItem(AUTO_KEY)}catch(_){}
    console.info(`Mission Vector ${VERSION}: invalidated a pre-revision sync queue so Rebel Command can request a fresh server worklist.`);
  }
}catch(e){console.warn(`Mission Vector ${VERSION}: queue revision check skipped.`,e)}
})();
