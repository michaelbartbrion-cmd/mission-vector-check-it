'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    async function startCaptainDailyMissingRecheck(');
const b=src.indexOf('    function consumeQueuedCaptainDailyAfterVerifiedRun(',a);
assert.ok(a>0&&b>a,'targeted recheck source');
const inner=src.slice(a,b);
const makeReport=(legacy=false)=>{
 const rows=[
  {assetId:'A-10',type:'Coat',status:'ok',tourDates:['2026-11-09'],tourChecks:[{due:true,ok:true}]},
  {assetId:'A-11',type:'Pants',status:'ok',tourDates:[],tourChecks:[{due:true,ok:false}]},
  {assetId:'A-12',type:'Helmet',status:'error',tourDates:[],tourChecks:[{due:true,ok:false}]},
  {assetId:'A-13',type:'Boots',status:'ok',tourDates:[],tourChecks:[{due:false,ok:false,off:true}]}
 ];
 const report={schemaVersion:legacy?7:8,setId:'set1',setName:'Captain',
  auditWindow:{asOfDate:'2026-11-15'},
  tourRoster:{startDate:'2026-11-15',endDate:'2026-11-16',
   basePrefixes:['PERSON-BRION'],onByDate:{
     '2026-11-15':['PERSON-BRION'],'2026-11-16':['PERSON-BRION']
   }},
  owners:[{name:'Michael Brion',prefix:'PERSON-BRION',items:rows}]};
 if(!legacy)report.sourceSnapshot={
  owners:[{name:'Michael Brion',prefix:'PERSON-BRION'}],
  items:rows.map(x=>({assetId:x.assetId,ownerPrefix:'PERSON-BRION',
   ownerName:'Michael Brion',type:x.type,url:'https://vector.example/equipment/'+x.assetId})),
  results:rows.map(x=>({assetId:x.assetId,ownerPrefix:'PERSON-BRION',status:x.status,
   tour:{dates:x.tourDates||[]}})),auditAsOfDate:'2026-11-15'
 };
 return report;
};
function harness(report,{lost=false,alreadyRunning=false}={}){
 const saved=[],visited=[],statuses=[],scanned=[],errors=[];
 const targetFn=r=>(r.owners||[]).flatMap(o=>(o.items||[])
  .filter(i=>(i.tourChecks||[]).some(x=>x.due&&!x.ok))
  .map(i=>({assetId:i.assetId,type:i.type,
   ownerName:o.name,ownerPrefix:o.prefix})));
 const previousFn=r=>(r.owners||[]).flatMap(o=>o.items.map(i=>({
  ownerName:o.name,ownerPrefix:o.prefix,assetId:i.assetId,type:i.type,
  status:i.status,tour:{dates:i.tourDates||[]}
 })));
 const fakeInventory={source:'Vector PPE Responsible Party column',
  items:(report.owners[0].items||[]).filter(i=>i.assetId!=='A-13').map(i=>({
   assetId:i.assetId,type:i.type,pool:'123',template:'456',
   ownerName:'Michael Brion',url:'https://vector.example/equipment/'+i.assetId,status:'In Service'
  }))};
 const args={
  getRun:()=>alreadyRunning?{runId:'busy'}:null,
  getCaptainDailyCheck:()=>null,
  setStatus:(msg)=>{statuses.push(msg)},
  captainDailyMissingTargets:targetFn,
  ensurePpeEquipmentPage:async()=>true,
  rosterPersonByPrefix:p=>({prefix:p,name:'Michael Brion'}),
  scanPpeCrewOwners:async owners=>{scanned.push(owners.map(x=>x.name));return fakeInventory},
  discoverOwnerGear:async(owner,mode,inventory)=>({
   items:lost?inventory.items.filter(x=>x.assetId!=='A-12'):inventory.items
  }),
  captainDailySourceResults:previousFn,
  validDateKey:v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v:'',
  saveCaptainDailyCheck:v=>saved.push(v),
  rebelCommandEvent:()=>null,navigateCaptainDailyToItem:(check,item)=>visited.push(item),
  saveDiagnostic:x=>errors.push(x),reportRebelErrorToCommand:()=>null,
  location:{href:'https://vector.example/PPE'},TAB_ID:'tab1',
  clean:x=>String(x||'').trim()
 };
 const names=Object.keys(args);
 const factory=new Function(...names,
  'let captainDailyBusy=false;\n'+inner+
  '\nreturn {start:startCaptainDailyMissingRecheck,merge:mergeCaptainDailyRecheckResult};');
 const api=factory(...names.map(k=>args[k]));
 return{...api,saved,visited,statuses,scanned,errors};
}
test('new report recheck reads exactly two missing, not two already complete/off',async()=>{
 const h=harness(makeReport());
 assert.equal(await h.start(makeReport()),true);
 assert.equal(h.scanned.length,0,'verified original native item URLs reused');
 assert.equal(h.saved.length,1);
 const check=h.saved[0];
 assert.deepEqual(check.items.map(x=>x.assetId),['A-11','A-12']);
 assert.deepEqual(check.fullItems.map(x=>x.assetId),['A-10','A-11','A-12','A-13']);
 assert.equal(check.results.length,4);
 assert.equal(check.results.find(x=>x.assetId==='A-10').status,'ok');
 assert.equal(check.tourRoster.startDate,'2026-11-15');
 assert.equal(h.visited.length,1);
 assert.equal(h.visited[0].assetId,'A-11');
});
test('v7 report without saved URLs scans only affected owner and preserves prior greens',async()=>{
 const r=makeReport(true),h=harness(r);
 assert.equal(await h.start(r),true);
 assert.equal(h.scanned.length,1);
 assert.deepEqual(h.scanned[0],['Michael Brion']);
 assert.deepEqual(h.saved[0].items.map(i=>i.assetId),['A-11','A-12']);
 assert.equal(h.saved[0].results.find(x=>x.assetId==='A-10').status,'ok');
});
test('unresolved item is a safe stop: never navigate or replace the previous report',async()=>{
 const r=makeReport(true),h=harness(r,{lost:true});
 assert.equal(await h.start(r),false);
 assert.equal(h.saved.length,0);
 assert.equal(h.visited.length,0);
 assert.match(h.statuses.at(-1),/Cannot safely locate/);
});
test('cannot start missing recheck while a real inspection is running',async()=>{
 const r=makeReport(),h=harness(r,{alreadyRunning:true});
 assert.equal(await h.start(r),false);
 assert.equal(h.saved.length,0);assert.equal(h.visited.length,0);
});
test('merge preserves old completed history during failures and adds newly verified checks',()=>{
 const h=harness(makeReport());
 const old={assetId:'A-11',status:'ok',
   tour:{dates:['2026-11-09'],latestDate:'2026-11-09'}};
 const fail=h.merge(old,{assetId:'A-11',status:'error',error:'Item Log unreadable'});
 assert.equal(fail.status,'ok');
 assert.deepEqual(fail.tour.dates,['2026-11-09']);
 const success=h.merge(old,{assetId:'A-11',status:'ok',tour:{
   dates:['2026-11-15'],latestDate:'2026-11-15'
 }});
 assert.deepEqual(success.tour.dates,['2026-11-15','2026-11-09']);
 assert.equal(success.tour.latestDate,'2026-11-15');
});
