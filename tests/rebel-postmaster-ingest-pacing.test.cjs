const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const part=source.split('async function paceIndexBatch(')[1].split('\nasync function runFolderSync(')[0];
function fixture(failAt=0){
 let now=100000,storage=new Map(),delays=[],calls=[],checkpoints=[],reports=0;
 const ctx={Date:class extends Date{static now(){return now}},GM_getValue:(k,d)=>storage.get(k)??d,GM_setValue:(k,v)=>storage.set(k,v),wait:async ms=>{delays.push(ms);now+=ms},request:async p=>{calls.push({p,at:now});if(failAt===calls.length)throw Error('Telemetry unavailable');return{workEmail:{accepted:true}}},makeCapture:msgs=>msgs,MAX_FOLDER_MESSAGES:25000,saveCrawl:s=>checkpoints.push([...s.seen]),reportCrawl:async()=>{reports++}};
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
