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
function setup({notices=[],rows=[],busy=false,searchText='',heading='',groups=[],selected=true,folderName="fixture",notesRegion=null,mailList=null}={}){
 let elapsed=0;
 const ctx={
   document:{getElementById:id=>id==="Jump to notes list-region"?notesRegion:id==="MailList"?mailList:null,querySelectorAll:selector=>selector.startsWith('input[')?(searchText?[{value:searchText}]:[]):selector.startsWith('[role="heading"]')?(heading?[{visible:true,innerText:heading}]:[]):selector.startsWith('[role="group"]')?groups:notices},
   Date:{now:()=>elapsed},
   visible:el=>!!el.visible,
   attr:(el,k)=>el?.[k]||'',
   clean:txt=>String(txt||'').trim(),
   candidateRows:()=>rows,
   mailBusy:()=>busy,
   selectedFolderCandidate:()=>selected?{key:'exact-folder',name:folderName}:null,
   nativeMessageListRegion:el=>el.inList?{}:null,
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

test('live native empty group within Message list certifies stable empty folder',async()=>{
 const group={visible:true,inList:true,innerText:'Nothing in folder Looks empty over here.'};
 assert.equal(await setup({groups:[group]}).checkEmpty(),true);
});
test('native phrase outside Message list, hidden, unselected or filtered cannot certify empty',async()=>{
 const group={visible:true,inList:true,innerText:'Nothing in folder Looks empty over here.'};
 for(const opts of [{groups:[{...group,inList:false}]},{groups:[{...group,visible:false}]},{groups:[group],selected:false},{groups:[group],searchText:'from someone'},{groups:[group],rows:[{}]},{groups:[group],busy:true}])
   assert.equal(await setup(opts).checkEmpty(2200),false);
});

test('native MailList id under observed region works even with no explicit role',async()=>{
 const group={visible:true,id:'MailList',closest:sel=>sel==='[id="Skip to message list-region"]'?{}:null,innerText:'Nothing in folder Looks empty over here.'};
 assert.equal(await setup({groups:[group]}).checkEmpty(),true);
 assert.equal(await setup({groups:[{...group,closest:()=>null}]}).checkEmpty(2200),false);
 assert.equal(await setup({groups:[{...group,innerText:'Nothing in folder Looks empty over here. Some other text'}]}).checkEmpty(2200),false);
});

test('Archive empty witness requires exact selected Archive and observed list region',async()=>{
 const group={visible:true,id:'MailList',closest:()=>({}),innerText:'Nothing in Archive Clean up your inbox by moving messages to Archive.'};
 assert.equal(await setup({groups:[group],folderName:'Archive'}).checkEmpty(),true);
 assert.equal(await setup({groups:[group],folderName:'Other'}).checkEmpty(2200),false);
});
test('native Notes view is excluded as non-mail, not claimed empty or treated as arbitrary named folder',async()=>{
 const native={visible:true};
 const h=setup({folderName:'Notes',notesRegion:native});
 assert.equal(await h.stableNonMailNotesView(),true);
 assert.equal(await setup({folderName:'Notes'}).stableNonMailNotesView(),false);
 assert.equal(await setup({folderName:'Other',notesRegion:native}).stableNonMailNotesView(),false);
 assert.equal(await setup({folderName:'Notes',notesRegion:native,mailList:{visible:true}}).stableNonMailNotesView(),false);
 assert.equal(await setup({folderName:'Notes',notesRegion:native,rows:[{}]}).stableNonMailNotesView(),false);
});
