'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    async function cPilotQueueReadOnlyResults(check){');
const b=source.indexOf('    // Existing single Enterprise broker',a);
assert.ok(a>0&&b>a,'Source read-only receipt builder boundaries missing');
test('real Vector multi-date PPE evidence is retained for both months without fake PASS',async()=>{
 let queue=[],sent=null,flushed=0;
 const sandbox={
  Date,Array,Set,Object,
  cPilotPending:()=>queue,
  cPilotFlushReceipts:async()=>{flushed++;return true},
  saveJSON:(key,value)=>{sent=key;queue=value},
  C_PILOT_PENDING_KEY:'pending',
  clean:x=>String(x||'').trim(),
  validDateKey:x=>typeof x==='string'&&
    /^\d{4}-\d{2}-\d{2}$/.test(x)?x:'',
  cPilotCache:null
 };
 vm.runInNewContext(source.slice(a,b),sandbox);
 const dates=Array.from({length:16},(_,i)=>
   new Date(Date.UTC(2026,9,4+i*3)).toISOString().slice(0,10));
 dates.push('2026-11-21');
 const verdicts=Object.fromEntries(dates.map(x=>[x,'unknown']));
 verdicts['2026-10-10']='failed';
 verdicts['2026-11-21']='passed';
 const item={assetId:'COAT-001',ownerName:'Example Firefighter',
   ownerPrefix:'EXAMPLE',inspectionModeKey:'tour'};
 const check={
   departmentRecheck:true,workDate:'2026-11-21',checkId:'native-history-1',
   items:[item],results:[{assetId:item.assetId,ownerPrefix:item.ownerPrefix,
     status:'ok',readAt:'2026-11-22T04:45:00Z',
     tour:{dates,verdicts}}]
 };
 const result=await sandbox.cPilotQueueReadOnlyResults(check);
 assert.equal(result.delivered,true);
 assert.equal(flushed,1);
 assert.equal(queue.length,1);
 assert.equal(queue[0].kind,'departmentRecheck');
 assert.equal(queue[0].completedDates.length,17);
 assert.equal(queue[0].completedVerdicts['2026-10-10'],'failed');
 assert.equal(queue[0].completedVerdicts['2026-11-21'],'passed');
 assert.equal(queue[0].completedVerdicts['2026-10-04'],'unknown');
 assert.equal(queue[0].readResult,'ok');
 assert.equal(queue[0].nativeAssetIdentityVerified,true);
 assert.equal(sent,'pending');
});
