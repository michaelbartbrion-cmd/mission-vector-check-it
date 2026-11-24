const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const part=source.split('async function paceIndexBatch(')[1].split('\nasync function runFolderSync(')[0];
function fixture(failAt=0){
 let now=100000,storage=new Map(),delays=[],calls=[],checkpoints=[],reports=0;
 const ctx={crawlMatchesPage:()=>true,crawlAbort:false,Date:class extends Date{static now(){return now}},GM_getValue:(k,d)=>storage.get(k)??d,GM_setValue:(k,v)=>storage.set(k,v),wait:async ms=>{delays.push(ms);now+=ms},request:async p=>{calls.push({p,at:now});if(failAt===calls.length)throw Error('Telemetry unavailable');return{workEmail:{accepted:true,messages:p.length}}},makeCapture:msgs=>msgs,MAX_FOLDER_MESSAGES:25000,saveCrawl:s=>checkpoints.push([...s.seen]),reportCrawl:async()=>{reports++}};
 vm.createContext(ctx);vm.runInContext('async function paceIndexBatch('+part,ctx);
 return {ctx,calls,delays,checkpoints,storage,getReports:()=>reports};
}
const rows=n=>Array.from({length:n},(_,i)=>({_strongId:true,messageKey:'id-'+i}));
test('large viewport fully collected in paced chunks below entity_update budget',async()=>{
 const h=fixture(),s={seen:[],folderName:'fixture'};
 assert.equal(await h.ctx.uploadNewRows(rows(123),s),123);
 assert.deepEqual(h.calls.map(x=>x.p.length),[50,50,23]);
 assert.deepEqual(h.delays,[63000,63000]);assert.equal(new Set(s.seen).size,123);assert.equal(h.getReports(),3);
});
test('failed ambiguous batch leaves only acknowledged keys checkpointed and never resends automatically',async()=>{
 const h=fixture(2),s={seen:[],folderName:'fixture'};
 await assert.rejects(h.ctx.uploadNewRows(rows(110),s),/Telemetry unavailable/);
 assert.equal(h.calls.length,2);assert.equal(s.seen.length,50);assert.equal(h.checkpoints.length,1);
});
test('next call honors shared persisted pacing and skips acknowledged rows',async()=>{
 const h=fixture(),s={seen:[],folderName:'fixture'};
 await h.ctx.uploadNewRows(rows(9),s);await h.ctx.uploadNewRows(rows(15),s);
 assert.deepEqual(h.calls.map(x=>x.p.length),[9,6]);assert.deepEqual(h.delays,[13800]);
});
test('folder identity changing while a paced batch waits stops before the next request',async()=>{
 const h=fixture(),s={seen:[],folderName:'fixture'};let checks=0;
 h.ctx.crawlMatchesPage=()=>++checks===1;
 await assert.rejects(h.ctx.uploadNewRows(rows(80),s),/folder changed during index pacing/);
 assert.equal(h.calls.length,1);assert.equal(s.seen.length,50);
});
test('pause requested during pacing retains accepted keys and submits no further batch',async()=>{
 const h=fixture(),s={seen:[],folderName:'fixture'};
 await h.ctx.uploadNewRows(rows(8),s);h.ctx.crawlAbort=true;
 await assert.rejects(h.ctx.uploadNewRows(rows(15),s),/paused before next batch/);
 assert.equal(h.calls.length,1);assert.equal(s.seen.length,8);
});
test('partial per-folder checkpoint remains exact-mailbox and exact-folder scoped',()=>{
 const sourcePart=source.split('function scopedPartialCheckpoint(')[1].split('\nfunction mailboxHasUnverifiedEmpty(')[0];
 const ctx={mailboxId:()=> 'mailbox:actual',MAX_FOLDER_MESSAGES:1000};
 vm.createContext(ctx);vm.runInContext('function scopedPartialCheckpoint('+sourcePart,ctx);
 const c={status:'error',mailboxId:'mailbox:actual',folderKey:'id:actual',seen:['id-1','id-2'],steps:20,lastTop:123};
 const saved=ctx.scopedPartialCheckpoint(c,{key:'id:actual'});
 assert.equal(saved.status,'paused');assert.equal(saved.steps,0);assert.equal(saved.lastTop,0);assert.equal(saved.seen.length,2);
 saved.seen.push('id-3');assert.equal(c.seen.length,2);
 assert.equal(ctx.scopedPartialCheckpoint(c,{key:'id:wrong'}),null);
 assert.equal(ctx.scopedPartialCheckpoint({...c,mailboxId:'mailbox:wrong'},{key:'id:actual'}),null);
 assert.equal(ctx.scopedPartialCheckpoint({...c,status:'complete'},{key:'id:actual'}),null);
});

test('same native ID repeated in virtualized viewport is submitted only once',async()=>{
 const h=fixture(),s={seen:[],folderName:'fixture'};
 const a=rows(3);assert.equal(await h.ctx.uploadNewRows([...a,a[0],a[1]],s),3);
 assert.equal(h.calls[0].p.length,3);assert.equal(s.seen.length,3);
});
test('accepted but incomplete or duplicate receipt cannot advance checkpoint',async()=>{
 const h=fixture(),s={seen:['id-previous'],folderName:'fixture'};
 for(const ack of [{accepted:true,messages:1},{accepted:true,duplicate:true,messages:0},{accepted:true}]){
  h.ctx.request=async()=>({workEmail:ack});
  await assert.rejects(h.ctx.uploadNewRows(rows(3),s),/did not acknowledge every unique/);
  assert.deepEqual(s.seen,['id-previous']);assert.equal(h.checkpoints.length,0);assert.equal(h.getReports(),0);
 }
});
