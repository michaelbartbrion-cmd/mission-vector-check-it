'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    async function startCaptainDailyCheck(set, auditAsOfDate) {');
const b=src.indexOf('    async function resumeCaptainDailyCheck() {',a);
assert.ok(a>0&&b>a,'actual first-run Captain audit is present');
const code=src.slice(a,b)+'\nreturn startCaptainDailyCheck;';
const owner={name:'Test Regular',prefix:'PERSON-REG',gearSearchPrefix:'REG'};
const extraOwner={name:'Test Guest',prefix:'PERSON-GUEST',gearSearchPrefix:'GUEST'};
const makeAsset=(who,id,pool,mode)=>({
 assetId:id,type:pool==='299947'?'SCBA Face Mask':
   pool==='300006'?'Wildland Helmet':'Coat',
 ownerName:who.name,ownerPrefix:who.prefix,
 pool,inspectionModeKey:mode,url:'https://vector.example/PPE/'+id
});
function harness({badOwner=false,onlyExtra=false}={}){
 let saved=null,visited=[],errors=[],submitted=0;
 const inventory={source:'Vector PPE Responsible Party column',items:[],
  ownerErrors:badOwner?[{name:extraOwner.name,error:'Owner ambiguous'}]:[]};
 const mock={
  validDateKey:v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v:'',
  captainShiftLabel:s=>s,
  captainAuditWindow:()=>({months:['2026-10','2026-11'],startDate:'2026-10-01',
   tours:[]}),
  getConfig:()=>({selfPrefix:'PERSON-REG',inspectorName:owner.name}),
  clean:v=>String(v||'').trim(),
  masterNameKey:v=>String(v||'').toLowerCase(),
  scanPpeCrewOwners:async()=>inventory,
  discoverOwnerGear:async who=>({items:onlyExtra?
   [makeAsset(who,'WILD','300006','tour')]:
   [makeAsset(who,'COAT','300045','tour'),
    makeAsset(who,'MASK','299947','scbaTour'),
    makeAsset(who,'WILD','300006','tour')],
   unknown:[]}),
  captainTourRequiredItem:item=>['300045','299947'].includes(item.pool),
  saveCaptainDailyCheck:check=>{saved=check},
  captainDailyRememberSetup:()=>{},
  rebelCommandEvent:()=>{},
  navigateCaptainDailyToItem:(_c,item)=>visited.push(item.assetId),
  clearCaptainDailyCheck:()=>{saved=null},
  reportRebelErrorToCommand:()=>{},
  setStatus:(msg)=>{if(/stopped/i.test(msg))errors.push(msg)},
  TAB_ID:'test-tab',
  location:{href:'https://vector.example/PPE'},
  Date,Math
 };
 const fn=new Function(...Object.keys(mock),
   'let captainDailyBusy=false;\n'+code)(...Object.values(mock));
 return{run:fn,get saved(){return saved},visited,errors};
}
test('initial native Captain audit includes only required routine Tour PPE and separate SCBA mask',async()=>{
 const h=harness();
 await h.run({id:'C-set',name:'C',shift:'C',memberPrefixes:['PERSON-REG'],
   people:[owner],tourRoster:{startDate:'2026-11-19',endDate:'2026-11-20'}},
  '2026-11-19');
 assert.deepEqual(h.saved.items.map(item=>[item.assetId,item.inspectionModeKey]),[
  ['COAT','tour'],['MASK','scbaTour']]);
 assert.deepEqual(h.visited,['COAT']);
 assert.equal(h.errors.length,0);
});
test('unresolved guest does not abort verified regular crew; guest stays in unresolved roster',async()=>{
 const h=harness({badOwner:true});
 await h.run({id:'C-set',name:'C',shift:'C',
  memberPrefixes:['PERSON-REG','PERSON-GUEST'],
  people:[owner,extraOwner],tourRoster:{}},'2026-11-19');
 assert.equal(h.saved.items.length,2);
 assert.equal(h.saved.owners.length,2);
 assert.equal(h.saved.discovery.length,2);
 assert.match(h.saved.discovery[1].error,/ownership unverified/i);
});
test('only unrequired assigned gear does not produce an empty successful audit',async()=>{
 const h=harness({onlyExtra:true});
 await h.run({id:'C-set',name:'C',shift:'C',memberPrefixes:['PERSON-REG'],
   people:[owner],tourRoster:{}},'2026-11-19');
 assert.equal(h.saved,null);
 assert.equal(h.visited.length,0);
 assert.match(h.errors.join(' '),/no mapped PPE items to read/i);
});
