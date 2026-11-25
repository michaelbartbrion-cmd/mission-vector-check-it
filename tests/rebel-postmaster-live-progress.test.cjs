
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const start=src.indexOf('async function reportMailboxProgress('),end=src.indexOf('function findFolderNavTarget(',start);
assert.ok(start>0&&end>start);
function fixture(opts={}){
 const target={key:'name:fixture',name:'Inbox',status:'error',indexedCount:8,lastError:'Navigation unresolved'};
 const ms={mailboxId:'outlook:fixture',folders:[target],status:'running'};
 const calls=[],traces=[];const ctx={VERSION:'rebel-postmaster-1.2.36',mailboxMatches:()=>!opts.wrongAccount,
  request:async payload=>{calls.push(payload);if(opts.rejectFolder)throw Error('network');return{workEmailIngestionState:{accepted:true}}},
  reportMailboxManifest:async value=>{calls.push({manifest:value.folders.map(x=>x.status)});if(opts.rejectManifest)throw Error('network');return true},
  trace:(...args)=>traces.push(args),clean:String,Date};
 vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
 return {ctx,calls,traces,ms,target};
}
test('navigation failure publishes exact discovered folder error and immediately refreshes manifest',async()=>{
 const h=fixture();assert.equal(await h.ctx.reportMailboxProgress(h.ms,h.target),true);
 const r=h.calls[0].workEmailIngestionState;assert.equal(r.folderId,'outlook:fixture:name:fixture');
 assert.equal(r.syncStatus,'error');assert.equal(r.indexedCount,8);assert.equal(r.lastError,'Navigation unresolved');assert.equal(r.lastPageCursor,'');
 assert.equal(h.calls[1].manifest[0],'error');
});
test('successful folder transition refreshes manifest only, without invented reads',async()=>{
 const h=fixture();h.target.status='complete';await h.ctx.reportMailboxProgress(h.ms,h.target);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].manifest[0],'complete');
});
test('wrong account never publishes a receipt, undiscovered target cannot publish folder state',async()=>{
 const h=fixture({wrongAccount:true});assert.equal(await h.ctx.reportMailboxProgress(h.ms,h.target),false);assert.equal(h.calls.length,0);
 const x=fixture();await x.ctx.reportMailboxProgress(x.ms,{...x.target});assert.equal(x.calls.length,1);
});
test('status delivery failures are traced and do not stop a productive mailbox crawl',async()=>{
 const h=fixture({rejectFolder:true,rejectManifest:true});assert.equal(await h.ctx.reportMailboxProgress(h.ms,h.target),false);
 assert.equal(h.calls.length,2);assert.equal(h.traces.length,2);
});
test('actual orchestrator publishes after native terminal transitions and failed navigation',()=>{
 const a=src.slice(src.indexOf('async function runMailboxSync('),src.indexOf('function pauseMailboxSync('));
 assert.equal((a.match(/await reportMailboxProgress\(ms,target\)/g)||[]).length,2);
 assert.equal((a.match(/await reportMailboxProgress\(ms\)/g)||[]).length,3);
 assert.match(a,/if\(deferHiddenFolderRetry\(target\)\)\{ms\.updatedAt=.*?saveMailbox\(ms\);await reportMailboxProgress\(ms\);if\(!await waitForDeferredNativeView\(ms,target\)\)break;/);
});


test('terminal failed mailbox pass never advances last successful completion timestamp',async()=>{
 const run=src.slice(src.indexOf('async function runMailboxSync('),src.indexOf('function pauseMailboxSync('));
 async function terminal(status,previous){
  const ms={mailboxId:'outlook:fixture',status:'running',lastSuccessAt:previous,folders:[{status,navAttempts:2,crawlAttempts:2,indexedCount:8}]};
  const reports=[];
  const ctx={state:{busy:false},paired:()=>true,mailboxId:()=>ms.mailboxId,mailboxState:()=>ms,mailboxMatches:()=>true,crawlState:()=>null,reconcileCompletedCrawl:()=>{},requeueShortCompletedFolders:()=>{},saveMailbox:()=>{},reportMailboxManifest:async m=>reports.push(JSON.parse(JSON.stringify(m))),mailboxSummary:m=>({folders:m.folders.length,complete:m.folders.filter(f=>f.status==='complete').length,errors:m.folders.filter(f=>f.status==='error').length,indexed:8}),canRetryFolder:()=>false,trace:()=>{},render:()=>{},clean:String,Date,MAX_MAILBOX_FOLDERS:120,mailboxAbort:false,crawlAbort:false};
  vm.createContext(ctx);vm.runInContext(run,ctx);await ctx.runMailboxSync();
  assert.equal(ctx.state.busy,false);return {ms,reports};
 }
 const previous='2026-11-23T21:42:29.110Z';
 const failed=await terminal('error',previous);
 assert.equal(failed.ms.status,'complete_with_errors');assert.equal(failed.ms.lastSuccessAt,previous);assert.equal(failed.reports.at(-1).lastSuccessAt,previous);
 const firstFailure=await terminal('error',undefined);assert.equal(firstFailure.ms.lastSuccessAt,undefined);
 const success=await terminal('complete',previous);assert.equal(success.ms.status,'complete');assert.equal(success.ms.lastSuccessAt,success.ms.updatedAt);assert.notEqual(success.ms.lastSuccessAt,previous);
});
