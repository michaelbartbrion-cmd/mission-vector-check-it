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

