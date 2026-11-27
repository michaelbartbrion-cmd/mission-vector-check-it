
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const start=src.indexOf("const PASSIVE_KEY="),end=src.indexOf("let openWatchSig=",start);
assert.ok(start>0&&end>start);
function fixture(opts={}){
 let scope={mailbox:'a',key:'inbox',folder:'a:inbox'},paired=true,busy=false,ms=null,cs=null,rows=[{_strongId:true,messageKey:'new-1',subject:'New'}],calls=[],pace=0;
 const store=new Map(),state={busy:false};
 let change=()=>{},response={workEmail:{accepted:true,messages:1}};
 const ctx={pendingDeferredTarget:m=>m?.status==='running'?m.folders?.find(f=>f.status==='pending'&&f.lastError==='hidden fixture')||null:null,mailboxId:()=>scope.mailbox,currentFolderKey:()=>scope.key,folderId:()=>scope.folder,
  paired:()=>paired,state,mailBusy:()=>busy,mailboxState:()=>ms,crawlState:()=>cs,
  GM_getValue:(k,d)=>store.get(k)||d,GM_setValue:(k,v)=>store.set(k,v),
  snapshot:()=>({messages:rows}),credibleMessageRow:m=>m._strongId===true,
  wait:async()=>{},paceIndexBatch:async()=>{pace++;change()},
  makeCapture:(messages,quality,notes)=>({messages,quality,notes,scope:{...scope}}),
  request:async p=>{calls.push(p);return response},trace:()=>{},clean:String,openWatchBusy:false,sourceAvailability:()=>({nativeRoots:1,credibleRows:rows.filter(m=>m._strongId).length}),hasExplicitEmptyFolderWitness:()=>false,hasNativeNonMailNotesView:()=>false,verify:async()=>({ok:true})};
 vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
 return{ctx,store,state,calls,scope,setScope:v=>{scope=v},setRows:v=>{rows=v},setMs:v=>{ms=v},setCs:v=>{cs=v},setChange:f=>{change=f},setResponse:v=>{response=v},setBusy:v=>{busy=v},setPaired:v=>{paired=v},paced:()=>pace};
}
test('passive collection uploads stable new IDs once and never writes folder manifest or crawl progress',async()=>{
 const h=fixture();assert.equal(await h.ctx.collectPassiveVisible(),true);assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].messages[0].messageKey,'new-1');assert.equal(h.calls[0].messages[0]._strongId,undefined);
 assert.equal(await h.ctx.collectPassiveVisible(),false);assert.equal(h.calls.length,1);
 assert.deepEqual([...h.store.keys()],['mvciPostmasterPassiveAckV1']);assert.equal(h.state.busy,false);
});
test('failed or short server acknowledgement leaves increment eligible for retry',async()=>{
 const h=fixture();h.setResponse({workEmail:{accepted:true,messages:0}});
 assert.equal(await h.ctx.collectPassiveVisible(),false);assert.equal(h.store.size,0);
 h.setResponse({workEmail:{accepted:true,messages:1}});assert.equal(await h.ctx.collectPassiveVisible(),true);
 assert.equal(h.calls.length,2);
});
test('mailbox or folder changes after pacing prevent mislabeled capture',async()=>{
 const h=fixture();h.setChange(()=>h.setScope({mailbox:'a',key:'other',folder:'a:other'}));
 assert.equal(await h.ctx.collectPassiveVisible(),false);assert.equal(h.calls.length,0);
 const x=fixture();x.setChange(()=>x.setRows([{_strongId:true,messageKey:'different'}]));
 assert.equal(await x.ctx.collectPassiveVisible(),false);assert.equal(x.calls.length,0);
});
test('passive monitor leaves active initial crawl alone and skips acknowledged checkpoint IDs',async()=>{
 const h=fixture();h.setMs({mailboxId:'a',status:'running'});assert.equal(await h.ctx.collectPassiveVisible(),false);
 h.setMs(null);h.setCs({mailboxId:'a',folderKey:'inbox',status:'error',seen:['new-1']});
 assert.equal(await h.ctx.collectPassiveVisible(),false);assert.equal(h.calls.length,0);
 h.setCs({mailboxId:'b',folderKey:'inbox',status:'error',seen:['new-1']});
 assert.equal(await h.ctx.collectPassiveVisible(),true);
});
test('passive acknowledgement cache is exact account and folder scoped',async()=>{
 const h=fixture();await h.ctx.collectPassiveVisible();h.setScope({mailbox:'b',key:'inbox',folder:'b:inbox'});
 assert.equal(await h.ctx.collectPassiveVisible(),true);assert.equal(h.calls.length,2);
 h.setScope({mailbox:'b',key:'sent',folder:'b:sent'});assert.equal(await h.ctx.collectPassiveVisible(),true);
 assert.equal(h.calls.length,3);
});
test('no pairing, ambiguous native folder identity, unstable loading or empty list never captures',async()=>{
 const h=fixture();h.setPaired(false);assert.equal(await h.ctx.collectPassiveVisible(),false);
 h.setPaired(true);h.setScope({mailbox:'a',key:'',folder:'a:fallback'});assert.equal(await h.ctx.collectPassiveVisible(),false);
 h.setScope({mailbox:'a',key:'inbox',folder:'a:inbox'});h.setBusy(true);assert.equal(await h.ctx.collectPassiveVisible(),false);
 h.setBusy(false);h.setRows([]);assert.equal(await h.ctx.collectPassiveVisible(),false);assert.equal(h.calls.length,0);
});
test('read-only increment uses existing timer and per-mailbox browser lock; no new native navigation',()=>{
 const code=src.slice(start,end);
 assert.match(code,/navigator\.locks\.request/);assert.match(code,/ifAvailable:true/);
 assert.doesNotMatch(code,/\.click\(|location\.(?:assign|replace)|scrollTop\s*=|runFolderSync\(|runMailboxSync\(/);
});


test('automatic one-minute timer triggers collection under exact mailbox browser lock without any click',async()=>{
 const h=fixture();let tick,lockName,options,started=0,pending;
 h.ctx.setInterval=(fn,ms)=>{assert.equal(ms,60000);tick=fn;started++;return 1};
 h.ctx.navigator={locks:{request:(name,opts,fn)=>{lockName=name;options=opts;pending=Promise.resolve(fn({name}));return pending}}};
 h.ctx.startPassiveWatcher();h.ctx.startPassiveWatcher();
 assert.equal(started,1);tick();await pending;
 assert.equal(lockName,'mvci-postmaster-visible-a');assert.equal(options.ifAvailable,true);assert.equal(h.calls.length,1);
 tick();await pending;assert.equal(h.calls.length,1);
});
test('another tab owning the mailbox lock prevents the automatic upload',async()=>{
 const h=fixture();let tick,pending;
 h.ctx.setInterval=fn=>{tick=fn;return 1};
 h.ctx.navigator={locks:{request:(_name,_opts,fn)=>{pending=Promise.resolve(fn(null));return pending}}};
 h.ctx.startPassiveWatcher();tick();await pending;assert.equal(h.calls.length,0);
});



test('idle presence uses an existing read-only bridge GET, without inventing mail progress or retry storms',async()=>{
 const h=fixture();let gets=0;h.ctx.verify=async()=>{gets++;return {ok:true}};
 const s=h.ctx.passiveScope();
 assert.equal(await h.ctx.reportIdlePresence(s),true);assert.equal(gets,1);assert.equal(h.calls.length,0);
 assert.equal(await h.ctx.reportIdlePresence(s),false);assert.equal(gets,1);
 assert.equal(h.store.has('mvciPostmasterPassiveAckV1'),false);
 const x=fixture();x.ctx.verify=async()=>{throw Error('offline')};
 assert.equal(await x.ctx.reportIdlePresence(x.ctx.passiveScope()),false);
 x.ctx.verify=async()=>{throw Error('must not retry immediately')};
 assert.equal(await x.ctx.reportIdlePresence(x.ctx.passiveScope()),false);
 const wrong=fixture();wrong.setRows([]);wrong.ctx.verify=async()=>{throw Error('no native evidence')};
 assert.equal(await wrong.ctx.reportIdlePresence(wrong.ctx.passiveScope()),false);assert.equal(wrong.store.size,0);
 const paused=fixture();paused.setMs({mailboxId:'a',status:'running'});assert.equal(await paused.ctx.reportIdlePresence(paused.ctx.passiveScope()),false);
 const changed=fixture();const oldScope=changed.ctx.passiveScope();changed.setScope({mailbox:'b',key:'inbox',folder:'b:inbox'});assert.equal(await changed.ctx.reportIdlePresence(oldScope),false);
});
test('existing passive timer reports presence when the native list is unchanged, without an extra worker',async()=>{
 const h=fixture();let tick,pending,gets=0;h.ctx.verify=async()=>{gets++;return {ok:true}};
 h.ctx.setInterval=fn=>{tick=fn;return 1};
 h.ctx.navigator={locks:{request:(_name,_opts,fn)=>{pending=Promise.resolve(fn({}));return pending}}};
 h.ctx.startPassiveWatcher();tick();await pending;assert.equal(h.calls.length,1);assert.equal(gets,0);
 tick();await pending;assert.equal(h.calls.length,1);assert.equal(gets,1);
 tick();await pending;assert.equal(gets,1);
});

test('yielded collection reports real contact without counting progress or reading mail, only in the exact deferred scope',async()=>{
 const h=fixture();let gets=0;h.ctx.verify=async()=>{gets++;return {ok:true}};
 h.setMs({mailboxId:'a',status:'running',folders:[{key:'inbox',status:'pending',lastError:'hidden fixture'}]});
 h.setCs({mailboxId:'a',status:'paused',folderKey:'inbox',seen:['previous']});
 assert.equal(await h.ctx.collectPassiveVisible(),false);
 assert.equal(await h.ctx.reportIdlePresence(h.ctx.passiveScope()),true);
 assert.equal(gets,1);assert.equal(h.calls.length,0);
 assert.equal(await h.ctx.reportIdlePresence(h.ctx.passiveScope()),false);
 assert.equal(h.store.has('mvciPostmasterPassiveAckV1'),false);
 const other=fixture();other.setMs({mailboxId:'a',status:'running',folders:[{key:'sent',status:'pending',lastError:'hidden fixture'}]});
 other.ctx.verify=async()=>{throw Error('must not verify another folder')};
 assert.equal(await other.ctx.reportIdlePresence(other.ctx.passiveScope()),false);
 assert.equal(other.store.size,0);
 const busy=fixture();busy.setMs({mailboxId:'a',status:'running',folders:[{key:'inbox',status:'pending',lastError:'hidden fixture'}]});
 busy.setCs({mailboxId:'a',status:'running'});
 assert.equal(await busy.ctx.reportIdlePresence(busy.ctx.passiveScope()),false);assert.equal(busy.store.size,0);
 busy.setCs(null);busy.setRows([]);
 assert.equal(await busy.ctx.reportIdlePresence(busy.ctx.passiveScope()),false);assert.equal(busy.store.size,0);
});
