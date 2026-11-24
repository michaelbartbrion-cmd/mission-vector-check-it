'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const a=source.indexOf('function explicitFolderItemCount('),b=source.indexOf('function newCrawl(',a);
assert.ok(a>0&&b>a);
function harness(){
 let active=null,candidates=[],saved=0;
 const ctx={attr:(el,k)=>el?.[k]||'',selectedFolderCandidate:()=>active,
 folderCandidates:()=>candidates,mailboxMatches:ms=>!!ms&&ms.mailboxId==='mailbox-A',
 saveMailbox:()=>saved++};
 vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);
 return {ctx,select:(key,label)=>{active={key,_el:{'aria-label':label}}},
 setCandidates:rows=>{candidates=rows.map(([key,label])=>({key,_el:{'aria-label':label}}))},saved:()=>saved};
}
test('native explicit item totals are distinct from unread badges and unknown labels',()=>{
 const h=harness();
 for(const [label,expected] of [['Junk Email selected [747] items',747],['Archive, 0 items',0],['Inbox, 6,401 items',6401],['TX-Tf2 78 unread',null],['Notes',null]]){
   assert.equal(h.ctx.explicitFolderItemCount({'aria-label':label}),expected);
 }
});
test('observed 52-of-747 item discrepancy preserves real captured rows but refuses complete',()=>{
 const h=harness();h.select('junk','Junk Email selected [747] items');
 const crawl={seen:Array.from({length:52},(_,i)=>'id'+i)};
 assert.throws(()=>h.ctx.assertFolderCoverage(crawl),/747 folder items.*52 distinct/);
 assert.equal(crawl.seen.length,52);assert.equal(crawl.nativeItemCount,747);
 h.select('junk','Junk Email selected [52] items');
 assert.doesNotThrow(()=>h.ctx.assertFolderCoverage(crawl));
});
test('known lower coverage requeues only matching authenticated folder without deleting stored records',()=>{
 const h=harness();h.setCandidates([['junk','Junk Email selected [747] items'],['unread','TX-Tf2 78 unread'],['match','Archive 5 items']]);
 const ms={mailboxId:'mailbox-A',status:'complete',folders:[{key:'junk',status:'complete',indexedCount:52},{key:'unread',status:'complete',indexedCount:10},{key:'match',status:'complete',indexedCount:5}]};
 assert.equal(h.ctx.requeueShortCompletedFolders(ms),1);
 assert.equal(ms.status,'complete_with_errors');assert.equal(ms.folders[0].status,'error');
 assert.equal(ms.folders[0].indexedCount,52);assert.equal(ms.folders[0].nativeItemCount,747);
 assert.equal(ms.folders[1].status,'complete');assert.equal(ms.folders[2].status,'complete');
 assert.equal(h.saved(),1);
 assert.equal(h.ctx.requeueShortCompletedFolders({...ms,mailboxId:'other'}),0);
});
test('native crawler refreshes replaced scroll host, checks bounded lazy loads, and verifies coverage before completion',()=>{
 assert.match(source,/activeScroller=listScroller\(\)/);
 assert.match(source,/bottomRetries<3/);
 assert.match(source,/await wait\(1800\)/);
 assert.match(source,/assertFolderCoverage\(s\);s.status='complete'/);
 assert.match(source,/target.indexedCount=Math.max\(Number\(target.indexedCount\|\|0\),Number\(after.seen\?\.length\|\|0\)\)/);
});
