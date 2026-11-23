'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const start=source.indexOf('function hasExplicitEmptyFolderWitness(){');
const end=source.indexOf('function readingPaneCandidates(){',start);
assert.ok(start>=0&&end>start,'Expected real empty-state reader');
const reader=source.slice(start,end);
function setup({notices=[],rows=[],busy=false,searchText='',heading=''}={}){
 let elapsed=0;
 const ctx={
   document:{querySelectorAll:selector=>selector.startsWith('input[')?(searchText?[{value:searchText}]:[]):selector.startsWith('[role="heading"]')?(heading?[{visible:true,innerText:heading}]:[]):notices},
   Date:{now:()=>elapsed},
   visible:el=>!!el.visible,
   clean:txt=>String(txt||'').trim(),
   candidateRows:()=>rows,
   mailBusy:()=>busy,
   wait:async ms=>{elapsed+=ms}
 };
 vm.createContext(ctx);
 vm.runInContext(reader+'\nglobalThis.checkEmpty=stableEmptyFolder;globalThis.witness=hasExplicitEmptyFolderWitness;',ctx);
 return ctx;
}
test('blank or throttled Outlook list without positive empty evidence is UNKNOWN, never complete',async()=>{
 const h=setup();
 assert.equal(h.witness(),false);
 assert.equal(await h.checkEmpty(2200),false);
});
test('unrelated message body containing empty-like text cannot certify folder empty',async()=>{
 const h=setup({notices:[]});
 assert.equal(await h.checkEmpty(2200),false);
});
test('a real visible empty-state announcement held across six samples can certify empty',async()=>{
 const h=setup({notices:[{visible:true,innerText:'This folder is empty.'}]});
 assert.equal(h.witness(),true);
 assert.equal(await h.checkEmpty(5200),true);
});
test('hidden empty-state notices are not evidence',async()=>{
 const h=setup({notices:[{visible:false,innerText:'Nothing here'}]});
 assert.equal(await h.checkEmpty(2200),false);
});
test('filtered Outlook search cannot certify the actual folder empty',async()=>{
 const notices=[{visible:true,innerText:'Nothing here'}];
 assert.equal(await setup({notices,searchText:'From: somebody'}).checkEmpty(2200),false);
 assert.equal(await setup({notices,heading:'Search results'}).checkEmpty(2200),false);
});
test('real rows and active loading override empty-state notices',async()=>{
 const notice=[{visible:true,innerText:'Nothing here'}];
 assert.equal(await setup({notices:notice,rows:[{id:1}]}).checkEmpty(2200),false);
 assert.equal(await setup({notices:notice,busy:true}).checkEmpty(2200),false);
});
test('older zero-count complete folder without proof is flagged for recheck',()=>{
 const f=source.match(/function mailboxHasUnverifiedEmpty\(ms\)\{[^\n]+/);
 assert.ok(f,'unverified legacy zero marker exists');
 const h={};vm.runInNewContext(f[0]+';globalThis.check=mailboxHasUnverifiedEmpty;',h);
 assert.equal(h.check({folders:[{status:'complete',indexedCount:0}]}),true);
 assert.equal(h.check({folders:[{status:'complete',indexedCount:0,emptyWitness:true}]}),false);
 assert.equal(h.check({folders:[{status:'complete',indexedCount:11}]}),false);
 assert.match(source,/s\.emptyWitness=true;s\.status='complete'/);
 assert.doesNotMatch(source,/phraseEmpty\|\|await stableEmptyFolder/);
 assert.match(source,/scopeOk&&needsVerification&&ms\?\.status!=='running'\?'VERIFY FOLDER INDEX'/);
});
