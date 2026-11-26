'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const s=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
function code(a,b){const x=s.indexOf(a),y=s.indexOf(b,x+a.length);assert.ok(x>=0&&y>x);return s.slice(x,y)}
const ctx={MAX_FOLDER_NAV_ATTEMPTS:2,MAX_FOLDER_NO_PROGRESS_ATTEMPTS:2,VERSION:'rebel-postmaster-1.2.36',Date,scope:true,count:18014};
ctx.crawlMatchesPage=()=>ctx.scope;ctx.currentFolderItemCount=()=>ctx.count;
vm.createContext(ctx);vm.runInContext(code('function statePayload(s){','async function reportCrawl(')+code('function noteFolderCoverage(s){','function assertFolderCoverage(')+code('function canRetryFolder(f){','function pauseFolderSync(){'),ctx);
test('native count and its observation timestamp remain separate from acknowledged IDs',()=>{
 const checkpoint={mailboxId:'a',folderId:'a:inbox',folderName:'Inbox',seen:['1','2'],status:'running'};
 assert.equal(ctx.noteFolderCoverage(checkpoint),18014);
 const first=ctx.statePayload(checkpoint).workEmailIngestionState;
 assert.equal(first.nativeItemCount,18014);assert.ok(first.nativeItemCountAt);assert.equal(first.indexedCount,2);
 ctx.count=null;ctx.noteFolderCoverage(checkpoint);
 const second=ctx.statePayload(checkpoint).workEmailIngestionState;
 assert.equal(second.nativeItemCountAt,first.nativeItemCountAt);
 ctx.scope=false;ctx.count=999;ctx.noteFolderCoverage(checkpoint);
 assert.equal(checkpoint.nativeItemCount,18014);ctx.scope=true;ctx.count=18014;
});
test('legacy unknown total is omitted; observed zero is a real count',()=>{
 const checkpoint={seen:[],status:'running',nativeItemCount:42};
 assert.equal(Object.hasOwn(ctx.statePayload(checkpoint).workEmailIngestionState,'nativeItemCount'),false);
 ctx.count=0;ctx.noteFolderCoverage(checkpoint);
 assert.equal(ctx.statePayload(checkpoint).workEmailIngestionState.nativeItemCount,0);ctx.count=18014;
});
test('retry stops after two unchanged failures but genuine additional acknowledged IDs allow further work',()=>{
 const target={status:'error',navAttempts:0,crawlAttempts:1,indexedCount:8};
 assert.equal(ctx.canRetryFolder(target),true);target.crawlAttempts=2;
 assert.equal(ctx.canRetryFolder(target),false);
 assert.equal(ctx.noteNewFolderProgress(target,{seen:Array(8).fill('a')}),false);assert.equal(target.crawlAttempts,2);
 assert.equal(ctx.noteNewFolderProgress(target,{seen:Array(9).fill('a')}),false);assert.equal(ctx.noteNewFolderProgress(target,{seen:Array.from({length:9},(_,i)=>'id'+i)}),true);assert.equal(target.crawlAttempts,0);assert.equal(ctx.canRetryFolder(target),true);
 target.navAttempts=2;assert.equal(ctx.canRetryFolder(target),false);
});
test('orchestrator uses bounded retry and only considers progress inside matching folder scope',()=>{
 assert.match(s,/ms\.folders\.find\(canRetryFolder\)/);
 assert.match(s,/if\(after&&crawlMatchesTarget\(after,target\)\)\{const partial=scopedPartialCheckpoint\(after,target\);if\(partial\)target\.crawlCheckpoint=partial;noteNewFolderProgress\(target,after\)/);
});


test('hidden native-source failure does not burn a retry or navigate until the same source is visible',async()=>{
 const c={document:{visibilityState:'hidden'},mailboxAbort:false,state:{},render:()=>{},mailboxMatches:()=>true,targetMatchesPage:()=>true,sourceAvailability:()=>({nativeRoots:1,credibleRows:0,listBusy:false}),waits:0};
 c.wait=async()=>{c.waits++;c.document.visibilityState='visible'};
 vm.createContext(c);
 vm.runInContext(code('function hiddenNativeSourceError(','function pauseFolderSync(){'),c);
 const target={status:'error',crawlAttempts:2,indexedCount:1413,lastError:'No credible message rows [view=hidden; roots=1; native rows=0; visible=0; credible=0; list busy=false]'};
 assert.equal(c.hiddenNativeSourceError(target.lastError),true);
 assert.equal(c.hiddenNativeSourceError(target.lastError.replace('hidden','visible')),false);
 assert.equal(c.deferHiddenFolderRetry(target),true);
 assert.equal(target.status,'pending');assert.equal(target.crawlAttempts,1);assert.equal(target.indexedCount,1413);
 assert.equal(await c.waitForDeferredNativeView({},target),true);assert.equal(c.waits,1);
 c.document.visibilityState='hidden';c.mailboxAbort=true;
 assert.equal(await c.waitForDeferredNativeView({},target),false);assert.equal(c.waits,1);
 c.mailboxAbort=false;c.document.visibilityState='visible';c.targetMatchesPage=()=>false;
 await assert.rejects(c.waitForDeferredNativeView({},target),/scope changed/);
 assert.match(s,/if\(deferHiddenFolderRetry\(target\)\)/);
});
test('deferred same-folder crawl resumes when credible hidden native list returns without foregrounding Outlook',async()=>{
 const c={document:{visibilityState:'hidden'},mailboxAbort:false,state:{},render:()=>{},mailboxMatches:()=>true,targetMatchesPage:()=>true,waits:0};
 c.sourceAvailability=()=>({nativeRoots:1,credibleRows:c.waits?9:0,listBusy:false});
 c.wait=async()=>{c.waits++};
 vm.createContext(c);vm.runInContext(code('function hiddenNativeSourceError(','function pauseFolderSync(){'),c);
 assert.equal(await c.waitForDeferredNativeView({},{}),true);
 assert.equal(c.waits,1);assert.equal(c.document.visibilityState,'hidden');
 c.waits=0;c.sourceAvailability=()=>({nativeRoots:1,credibleRows:9,listBusy:true});
 c.wait=async()=>{c.waits++;c.targetMatchesPage=()=>false};
 await assert.rejects(c.waitForDeferredNativeView({},{}),/scope changed/);assert.equal(c.waits,1);
 const orchestration=code('async function runMailboxSync(','function pauseMailboxSync(');
 assert.match(orchestration,/if\(target\.status==='pending'&&hiddenNativeSourceError\(target\.lastError\)\)\{if\(!await waitForDeferredNativeView\(ms,target\)\)break;target\.lastError='';ms\.lastError='';saveMailbox\(ms\)\}if\(!targetMatchesPage/);
});
