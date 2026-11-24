
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const start=src.indexOf("const PASSIVE_KEY="),end=src.indexOf("let openWatchSig=",start);
assert.ok(start>0&&end>start);
function fixture(opts={}){
 let scope={mailbox:'a',key:'inbox',folder:'a:inbox'},paired=true,busy=false,ms=null,cs=null,rows=[{_strongId:true,messageKey:'new-1',subject:'New'}],calls=[],pace=0;
 const store=new Map(),state={busy:false};
 let change=()=>{},response={workEmail:{accepted:true,messages:1}};
 const ctx={mailboxId:()=>scope.mailbox,currentFolderKey:()=>scope.key,folderId:()=>scope.folder,
  paired:()=>paired,state,mailBusy:()=>busy,mailboxState:()=>ms,crawlState:()=>cs,
  GM_getValue:(k,d)=>store.get(k)||d,GM_setValue:(k,v)=>store.set(k,v),
  snapshot:()=>({messages:rows}),credibleMessageRow:m=>m._strongId===true,
  wait:async()=>{},paceIndexBatch:async()=>{pace++;change()},
  makeCapture:(messages,quality,notes)=>({messages,quality,notes,scope:{...scope}}),
  request:async p=>{calls.push(p);return response},trace:()=>{},clean:String,openWatchBusy:false};
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

