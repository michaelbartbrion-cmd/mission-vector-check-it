'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
function part(a,b){const x=src.indexOf(a),y=src.indexOf(b,x+1);assert.ok(x>=0&&y>x);return src.slice(x,y)}
const hiddenError='No credible message rows [view=hidden; roots=1; native rows=0; visible=0; credible=0; list busy=false]';
function fixture(){
 const target={key:'inbox',name:'Inbox',status:'pending',indexedCount:2,crawlAttempts:0,navAttempts:0,lastError:''};
 const ms={mailboxId:'a',status:'running',folders:[target]};
 let cs={mailboxId:'a',folderKey:'inbox',status:'paused',seen:['one','two']},account='a',folder='inbox',readable=false,held=false,reads=0,navs=0,ack=0;
 const receipts=[],lockEvents=[];
 const ctx={state:{busy:false},document:{visibilityState:'hidden'},paired:()=>true,mailboxId:()=>account,selectedFolderCandidate:()=>({key:folder}),mailboxMatches:m=>m?.mailboxId===account,targetMatchesPage:t=>t.key===folder,
  mailboxState:()=>ms,crawlState:()=>cs,saveMailbox:()=>{},saveCrawl:c=>{cs=c},reconcileCompletedCrawl:()=>{},requeueShortCompletedFolders:()=>{},
  crawlMatchesTarget:(c,t)=>c?.mailboxId===account&&c.folderKey===t.key,crawlMatchesPage:c=>c?.mailboxId===account&&c.folderKey===folder,
  scopedPartialCheckpoint:c=>({...c,status:'paused'}),reportMailboxManifest:async m=>receipts.push({status:m.status,lastError:m.lastError}),reportMailboxProgress:async m=>receipts.push({status:m.status,lastError:m.lastError}),
  mailboxSummary:m=>({folders:m.folders.length,complete:m.folders.filter(f=>f.status==='complete').length,errors:m.folders.filter(f=>f.status==='error').length,indexed:m.folders.reduce((n,f)=>n+f.indexedCount,0)}),
  runFolderSync:async opts=>{assert.equal(opts.fresh,false);reads++;if(!readable){cs={...cs,status:'error',lastError:hiddenError};return}ack++;cs={...cs,status:'complete',seen:['one','two','three'],lastSuccessAt:'2026-11-26T20:00:00Z'}},
  navigateToFolder:async()=>{navs++;throw Error('Unexpected navigation')},
  sourceAvailability:()=>({nativeRoots:1,credibleRows:readable?9:0,listBusy:false}),render:()=>{},trace:()=>{},clean:String,
  MAX_MAILBOX_FOLDERS:14,MAX_FOLDER_NAV_ATTEMPTS:2,MAX_FOLDER_NO_PROGRESS_ATTEMPTS:2,Date,crawlAbort:false,
  navigator:{locks:{request:async(name,opts,fn)=>{assert.equal(name,'mvci-postmaster-visible-a');assert.equal(opts.ifAvailable,true);if(held){lockEvents.push('denied');return fn(null)}held=true;lockEvents.push('acquire');try{return await fn({name})}finally{held=false;lockEvents.push('release')}}}}
 };
 vm.createContext(ctx);vm.runInContext(part('function hiddenNativeSourceError(','function pauseFolderSync(')+part('let mailboxAbort=false;','async function captureList(')+part('function bootResumeIntent(','function startUiWatchdog(')+part('async function withManualCollectionLock(','async function handleUiAction('),ctx);
 return {ctx,ms,target,receipts,lockEvents,setReadable:v=>{readable=v},setFolder:v=>{folder=v},setAccount:v=>{account=v},setHeld:v=>{held=v},get reads(){return reads},get navs(){return navs},get ack(){return ack},get held(){return held}};
}
test('actual manual crawl yields lock on hidden unavailable native list and boot resumes exact checkpoint when it recovers',async()=>{
 const h=fixture();
 await h.ctx.withManualCollectionLock(()=>h.ctx.runMailboxSync({fresh:false}));
 assert.equal(h.reads,1);assert.equal(h.ack,0);assert.equal(h.held,false);
 assert.equal(h.target.status,'pending');assert.equal(h.target.indexedCount,2);assert.equal(h.target.crawlAttempts,0);
 assert.equal(h.ms.status,'running');assert.equal(h.ms.lastError,hiddenError);assert.equal(h.ctx.state.busy,false);
 assert.deepEqual(h.lockEvents,['acquire','release']);
 assert.equal(await h.ctx.tryBootResume(),false);assert.equal(h.reads,1);assert.equal(h.lockEvents.length,2);
 h.setReadable(true);h.setFolder('other');assert.equal(await h.ctx.tryBootResume(),false);assert.equal(h.navs,0);
 h.setFolder('inbox');h.setHeld(true);assert.equal(await h.ctx.tryBootResume(),false);assert.equal(h.reads,1);
 h.setHeld(false);assert.equal(await h.ctx.tryBootResume(),true);assert.equal(h.reads,2);assert.equal(h.ack,1);
 assert.equal(h.target.indexedCount,3);assert.equal(h.ms.status,'complete');assert.equal(h.held,false);assert.equal(h.navs,0);
 assert.equal(await h.ctx.tryBootResume(),false);assert.equal(h.reads,2);
});
test('manual collection respects another same-origin lock; pausing saved intent prevents restart',async()=>{
 const h=fixture();let calls=0;
 h.setHeld(true);assert.equal(await h.ctx.withManualCollectionLock(async()=>calls++),false);assert.equal(calls,0);assert.match(h.ctx.state.msg,/holds the browser lock/);
 h.setHeld(false);await h.ctx.withManualCollectionLock(()=>h.ctx.runMailboxSync());
 assert.equal(h.target.status,'pending');h.ms.status='paused';h.setReadable(true);
 assert.equal(await h.ctx.tryBootResume(),false);assert.equal(h.reads,1);assert.equal(h.held,false);
 const wrong=fixture();wrong.setAccount('');await assert.rejects(wrong.ctx.withManualCollectionLock(async()=>calls++),/not confirmed/);assert.equal(calls,0);
});
