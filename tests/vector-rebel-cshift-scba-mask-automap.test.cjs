'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=source.indexOf('    function cPilotQueueScopedInventory(');
const end=source.indexOf('    function cPilotQueueInventoryFromRun(',start);
assert.ok(start>0&&end>start,'Real Vector C-shift native scoped inventory source exists');
function tester(){
 const pending=[],saved=[],flushed=[];
 const context={
  Date,Set,Object,JSON,
  clean:x=>String(x||'').trim(),C_PILOT_NAMES:new Set(['michael brion']),
  isMasterOwnerInstallation:()=>true,getConfig:()=>({inspectorName:'Michael Brion'}),
  getActiveMasterRoster:()=>[{name:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588'}],
  inferRegularTourWindow:()=>({isActiveTour:true,startDate:'2026-11-21'}),
  BUILTIN_MODES:{tour:{templates:{'300045':'112411','300036':'118098',
    '299879':'118114','299882':'118117','299900':'118109','299881':'118110'}}},
  SCBA_FACE_MASK_POOL:'299947',
  cPilotNativePath:u=>new URL(u,'https://checkitapp.targetsolutions.com').pathname,
  cPilotPending:()=>pending,
  saveJSON:(k,items)=>{saved.push(k);assert.equal(items,pending)},
  C_PILOT_PENDING_KEY:'pending-test',
  cPilotFlushReceipts:async()=>{flushed.push(true);return true}
 };
 const fn=vm.runInNewContext(source.slice(start,end)+'\ncPilotQueueScopedInventory',context);
 return{fn,pending,saved,flushed};
}
const gear=(pool,id,type,mode)=>({pool,assetId:id,type,
 ownerName:'Michael Brion',...(mode?{inspectionModeKey:mode}:{}),
 url:'https://checkitapp.targetsolutions.com/app/equipment/PPE/pool/'+pool+'/45/item'});
test('C-shift native mapping includes exactly scoped SCBA mask despite missing inspectionModeKey on Vector row',()=>{
 const t=tester();
 const n=t.fn([{ownerName:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588',
  items:[gear('300045','BRION-COAT-01','Bunker Coat'),
   gear('299947','BRION-MASK-01','SCBA Face Mask'),
   gear('399999','UNRELATED-01','Paratech'),
   gear('299947','CONFLICT-MODE-01','SCBA Face Mask','tour')]}],
  '2026-11-22T18:15:00Z','2026-11-21');
 assert.equal(n,1);
 assert.equal(t.pending.length,1);
 const receipt=t.pending[0];
 assert.equal(receipt.kind,'inventory');
 assert.equal(receipt.source,'vector_responsible_party_scoped_read_only');
 assert.equal(receipt.items.length,2);
 assert.equal(receipt.items[0].assetId,'BRION-COAT-01');
 assert.equal(receipt.items[0].inspectionMode,'tour');
 assert.equal(receipt.items[1].assetId,'BRION-MASK-01');
 assert.equal(receipt.items[1].inspectionMode,'scbaTour');
 assert.equal(receipt.items[1].assetPath,'/app/equipment/PPE/pool/299947/45/item');
 assert.ok(!receipt.items.some(x=>/Paratech|CONFLICT/i.test(x.assetId)));
 assert.equal(t.saved.length,1);
});
test('active confirmed C-shift firefighter missing only a mask is eligible for automatic owner map',()=>{
 const before=source.slice(source.indexOf('    async function cPilotMapWorkingGear('),
 source.indexOf('    async function cPilotQueueReadOnlyResults('));
 assert.match(before,/working\.filter\(row=>Number\(row\.knownItems\)===0\|\|\s*Number\(row\.maskKnownItems\)===0\)/);
 assert.match(source,/board\.people\.filter\(p=>p\.attendance==='working'&&\s*\(Number\(p\.knownItems\)===0\|\|\s*Number\(p\.maskKnownItems\)===0\)\)/);
});
