'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const start=source.indexOf('function mailboxHasUnverifiedEmpty(ms)');
const end=source.indexOf('function mailboxSummary(ms)',start);
assert.ok(start>=0&&end>start,'expected full mailbox retry and reconcile helpers');
function setup(){
 const ctx={
  crawlMatchesTarget:(c,f)=>c.mailboxId==='outlook:1yhbdbn'&&f.key===c.folderKey,
  Date
 };
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end),ctx);
 return ctx;
}
const folders=()=>[
 {key:'one',status:'complete',indexedCount:9,lastError:''},
 {key:'two',status:'error',indexedCount:0,lastError:'No credible rows'},
 {key:'three',status:'complete',indexedCount:10,lastError:''}
];
test('paused 6/14 or error work with failed folders actively opts into existing bounded retry mode',()=>{
 const h=setup();
 assert.equal(h.mailboxNeedsRetry({status:'paused',folders:folders()}),true);
 assert.equal(h.mailboxNeedsRetry({status:'error',folders:folders()}),true);
 assert.equal(h.mailboxNeedsRetry({status:'complete_with_errors',folders:folders()}),true);
 assert.equal(h.mailboxNeedsRetry({status:'complete',folders:folders()}),false);
 assert.equal(h.mailboxNeedsRetry({status:'running',folders:folders()}),false);
});
test('never retries a previously completed genuine populated folder without an error',()=>{
 const h=setup();
 assert.equal(h.mailboxNeedsRetry({status:'paused',folders:[{key:'one',status:'complete',indexedCount:50,emptyWitness:false}]}),false);
 assert.equal(h.mailboxNeedsRetry({status:'paused',folders:[{key:'one',status:'complete',indexedCount:0,emptyWitness:true}]}),false);
});
test('previous unverified zero counts remain eligible for recheck',()=>{
 const h=setup();
 assert.equal(h.mailboxNeedsRetry({status:'complete',folders:[{status:'complete',indexedCount:0}]}),true);
});
test('latest real completed 50-row manual native folder scan advances stale 9-row mailbox summary',()=>{
 const h=setup(),ms={folders:folders()};
 const crawl={status:'complete',mailboxId:'outlook:1yhbdbn',folderKey:'one',seen:Array.from({length:50},(_,i)=>i),lastSuccessAt:'2026-11-23T21:42:29Z'};
 assert.equal(h.reconcileCompletedCrawl(ms,crawl),true);
 assert.equal(ms.folders[0].indexedCount,50);
 assert.equal(ms.folders[0].status,'complete');
 assert.equal(ms.folders[1].status,'error');
 assert.equal(ms.folders[2].indexedCount,10);
 assert.equal(h.reconcileCompletedCrawl(ms,crawl),false,'idempotent');
});
test('a mismatched account or unresolved native crawl never advances another folder',()=>{
 const h=setup(),ms={folders:folders()};
 assert.equal(h.reconcileCompletedCrawl(ms,{status:'complete',mailboxId:'outlook:wrong',folderKey:'one',seen:['x']}),false);
 assert.equal(h.reconcileCompletedCrawl(ms,{status:'running',mailboxId:'outlook:1yhbdbn',folderKey:'one',seen:['x']}),false);
 assert.equal(h.reconcileCompletedCrawl(ms,{status:'complete',mailboxId:'outlook:1yhbdbn',folderKey:'one',seen:[]}),false);
 assert.equal(ms.folders[0].indexedCount,9);
});
test('actual paused mailbox RESUME handler uses common retry predicate and does not force full reset',()=>{
 assert.match(source,/const ms=mailboxState\(\),retryErrors=mailboxMatches\(ms\)&&mailboxNeedsRetry\(ms\);await runMailboxSync/);
 assert.match(source,/reconcileCompletedCrawl\(ms,crawlState\(\)\);if\(retryErrors\)/);
 assert.match(source,/if\(retryErrors\)\{for\(const f of ms\.folders\)if\(f\.status==='error'/);
 assert.match(source,/scopeOk&&retryNeeded&&ms\?\.status!=='running'\?'RETRY MAIL ERRORS'/);
 assert.match(source,/@version\s+1\.2\.18/);
});
