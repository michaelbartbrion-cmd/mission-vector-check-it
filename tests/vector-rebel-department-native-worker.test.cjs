'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    function departmentOperationalKey(){');
const b=source.indexOf('    async function startCShiftPilotNativeRecheck(',a);
assert.ok(a>0&&b>a);
const feature=source.slice(a,b);
function harness(board){
 const queue=[],state=new Map(),out={mapped:[],nav:[],saved:[],queries:[],errors:[],scans:0,fallback:[],clears:0,lookupPosts:[]};
 const r={...board};
 const localStore={
  getItem:k=>state.get(k)||null,
  setItem:(k,v)=>state.set(k,String(v)),
  removeItem:k=>state.delete(k)
 };
 const approved=[{name:'Aaron No Gear',prefix:'AARON'},
  {name:'Austin Fox',prefix:'FOX'},{name:'Michael Brion',prefix:'BRION'}];
 const context={
  Date,Math,JSON,URL,URLSearchParams,
  sessionStorage:localStore,
  C_PILOT_NAMES:new Set(['michael brion']),
  C_PILOT_PENDING_KEY:'test-pending',
  TAB_ID:'ppe-isolated',
  localTodayKey:()=>r.date,
  cPilotBridge:async(method,action,data,query)=>{
   out.queries.push({method,action,query});
   if(action==='vr-ppe-department-lookup-status'){
     assert.equal(method,'POST');out.lookupPosts.push(data);
     return{ok:true,scope:'department-ppe-lookup-status',readOnly:true};
   }
   assert.equal(action,'vr-ppe-department');
   assert.equal(query.date,r.date);
   return r;
  },
  masterNameKey:s=>String(s||'').toLowerCase(),
  clean:s=>String(s||'').trim(),
  isMasterOwnerInstallation:()=>true,rebelCommandPaired:()=>true,
  getRun:()=>null,getCaptainDailyCheck:()=>null,captainDailyBusy:false,
  getActiveMasterRoster:()=>approved,
  ensurePpeEquipmentPage:async()=>{},
  scanPpeCrewOwners:async(owners)=>{out.scans++;out.mapped.push(owners);
    if(owners[0]?.name==='Aaron No Gear'||r.failPrimaryFor?.includes(owners[0]?.name))
     return{ownerErrors:[{name:owners[0]?.name,error:'No PPE assigned to Responsible Party'}],items:[]};
   return{ownerErrors:[],items:[{assetId:'FOX-COAT-01',ownerName:'Austin Fox',
     type:'Bunker Coat',pool:'300045',url:'https://checkitapp.targetsolutions.com/app/equipment/PPE/pool/300045/111/item'}]};},

   crewPpeSearchPrefix:owner=>({prefix:owner.name.split(' ').at(-1).toUpperCase()}),
   document:{querySelectorAll:selector=>selector.startsWith('button')?
     [{getAttribute:()=>'',innerText:'Clear Filters',click:()=>{out.clears++}}]:[]},
   visible:()=>true,uiEquals:(a,b)=>a===b,sleep:async()=>{},
   responsiblePartySelectionLabels:()=>[],
   scanPpeOwnerSearch:async owner=>{
     out.fallback.push(owner);
     if(owner.name==='Aaron No Gear')
       throw Error('No PPE could be verified for Aaron No Gear with PPE prefix GEAR and Responsible Party.');
     return{items:[{assetId:'FOX-COAT-01',
       ownerName:r.badFallback?'Someone Else':'Austin Fox',
       type:'Bunker Coat',pool:'300045',
       url:'https://checkitapp.targetsolutions.com/app/equipment/PPE/pool/300045/111/item'}]};
   },
   cPilotNativePath:u=>new URL(u,'https://checkitapp.targetsolutions.com').pathname,
  SCBA_FACE_MASK_POOL:'299947',
  BUILTIN_MODES:{tour:{templates:{'300045':'112411'}}},
  getMode:key=>key==='scbaTour'?{templates:{'299947':'119122'}}:
    {templates:{'300045':'112411'}},
  cPilotPending:()=>queue.slice(),
  saveJSON:(k,rows)=>{queue.splice(0,queue.length,...rows);out.saved.push(k)},
  cPilotFlushReceipts:async()=>true,
  saveCaptainDailyCheck:x=>out.saved.push(x),
  setStatus:s=>out.errors.push('status:'+s),
  location:{origin:'https://checkitapp.targetsolutions.com',href:'https://checkitapp.targetsolutions.com/main'},
  navigateCaptainDailyToItem:(check,item)=>out.nav.push(item)
 };
 vm.runInNewContext(feature,context);
 return {out,context,queue,state};
}
const rdate='2026-11-21';
const unmapped={scope:'department-ppe-readonly',readOnly:true,date:rdate,attendanceConfirmed:false,
 people:[{name:'Austin Fox',prefix:'FOX',sourceStatus:'scheduled_unconfirmed',
   attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null},
 {name:'Michael Brion',prefix:'BRION',sourceStatus:'scheduled_unconfirmed',
   attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null}]};
test('existing dedicated worker maps ONLY scheduled approved nonpilot owner and never submits inspection',async()=>{
 const h=harness(unmapped);
 const status=await h.context.departmentAutoOnePass();
 assert.equal(status,'mapped');
 assert.equal(h.out.scans,1);
 assert.deepEqual(JSON.parse(JSON.stringify(h.out.mapped[0])),[{name:'Austin Fox',prefix:'FOX'}]);
 assert.equal(h.queue[0].kind,'departmentInventory');
 assert.equal(h.queue[0].source,'vector_responsible_party_scoped_read_only');
 assert.equal(h.queue[0].items[0].inspectionMode,'tour');
 assert.equal(h.out.nav.length,0);
});
test('one mapped native target starts read-only Item Log and retains original browser tab',async()=>{
 const h=harness({...unmapped,people:[{...unmapped.people[0],knownItems:1,outstandingItems:1,
   nextItem:{assetId:'FOX-COAT-01',
     assetPath:'/app/equipment/PPE/pool/300045/111/item',
     inspectionMode:'tour',assetType:'Bunker Coat'}}]});
 const status=await h.context.departmentAutoOnePass();
 assert.equal(status,'started');
 const check=h.out.saved.find(x=>x&&typeof x==='object'&&x.departmentRecheck);
 assert.ok(check);
 assert.equal(check.pilotRecheck,true);
 assert.equal(check.workDate,rdate);
 assert.equal(check.items.length,1);
 assert.equal(h.out.nav[0].assetId,'FOX-COAT-01');
 assert.equal(h.out.scans,0);
});
test('mapped outside-C firefighter reads up to 12 legitimate PPE Item Logs in one existing serialized browser lease',async()=>{
 const items=[
  {assetId:'FOX-COAT-01',assetPath:'/app/equipment/PPE/pool/300045/111/item',
    inspectionMode:'tour',assetType:'Bunker Coat'},
  {assetId:'FOX-MASK-01',assetPath:'/app/equipment/PPE/pool/299947/222/item',
    inspectionMode:'scbaTour',assetType:'SCBA Face Mask'}
 ];
 const h=harness({...unmapped,people:[{...unmapped.people[0],
   knownItems:2,outstandingItems:2,pendingItems:items,nextItem:items[0]}]});
 assert.equal(await h.context.departmentAutoOnePass(),'started');
 const check=h.out.saved.find(x=>x&&x.departmentRecheck);
 assert.ok(check);
 assert.equal(check.items.length,2);
 assert.equal(check.items[0].assetId,'FOX-COAT-01');
 assert.equal(check.items[1].inspectionModeKey,'scbaTour');
 assert.equal(check.items[0].pool,'300045');
 assert.equal(check.items[0].itemId,'111');
 assert.equal(check.items[1].itemId,'222');
 assert.equal(check.items[1].template,'119122');
 assert.equal(h.out.nav.length,1,'only the first real Item Log navigates initially');
 assert.equal(h.out.nav[0].url.includes('pool/300045/111/item'),true);
 assert.equal(h.out.scans,0,'mapped native routes must not trigger another inventory crawl');
});
test('off, nonapproved, and wrong-pool links do not become successful reads',async()=>{
 const h=harness({...unmapped,people:[{...unmapped.people[0],sourceStatus:'off',
   knownItems:0},unmapped.people[1]]});
 assert.equal(await h.context.departmentAutoOnePass(),'none');
 assert.equal(h.out.scans,0);
 const q=harness({...unmapped,people:[{...unmapped.people[0],knownItems:1,outstandingItems:1,
   nextItem:{assetId:'X',assetPath:'/app/equipment/PPE/pool/299947/111/item',
    inspectionMode:'tour'}}]});
 await assert.rejects(()=>q.context.departmentAutoOnePass(),/invalid/i);
 assert.equal(q.out.nav.length,0);
});
test('one missing Vector Responsible Party cannot starve the rest of department',async()=>{
 const board={...unmapped,people:[
   {name:'Aaron No Gear',prefix:'AARON',sourceStatus:'scheduled_unconfirmed',
     attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null},
   unmapped.people[0]
 ]};
 const h=harness(board);
 await assert.rejects(()=>h.context.departmentAutoOnePass(),
   /No PPE could be verified for Aaron No Gear with PPE prefix GEAR/);
 assert.equal(h.out.scans,1);
 assert.equal(h.out.mapped[0][0].name,'Aaron No Gear');
 assert.equal(h.out.lookupPosts.length,1);
 assert.equal(h.out.lookupPosts[0].status,'owner_not_found');
 assert.equal(h.out.lookupPosts[0].personName,'Aaron No Gear');
 assert.equal(h.out.lookupPosts[0].source,'vector_responsible_party_readonly_lookup');
 assert.equal(h.out.lookupPosts[0].nativeCompletionDate,undefined);
 // Worker gets the next nine-minute lease; the failed first person remains
 // UNKNOWN but cannot block Austin's authentic Vector owner inventory.
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.scans,2);
 assert.equal(h.out.mapped[1][0].name,'Austin Fox');
 assert.equal(h.queue.length,1);
 assert.equal(h.queue[0].personName,'Austin Fox');
 assert.equal(await h.context.departmentAutoOnePass(),'none');
 assert.equal(h.out.nav.length,0);
});

test('read-only surname fallback may map PPE only with an exact live Responsible Party match',async()=>{
 const h=harness({...unmapped,failPrimaryFor:['Austin Fox']});
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.scans,1);
 assert.equal(h.out.clears,1);
 assert.equal(h.out.fallback.length,1);
 assert.equal(h.out.fallback[0].prefix,'FOX');
 assert.equal(h.queue[0].kind,'departmentInventory');
 assert.equal(h.queue[0].personName,'Austin Fox');
 assert.equal(h.out.nav.length,0);
 const bad=harness({...unmapped,failPrimaryFor:['Austin Fox'],badFallback:true});
 await assert.rejects(()=>bad.context.departmentAutoOnePass(),
   /No exactly assigned native PPE after both lookup methods/);
 assert.equal(bad.queue.length,0);
 assert.equal(bad.out.nav.length,0);
});
test('same safe broker lease skips unresolved owners and maps next verified firefighter',async()=>{
 const board={...unmapped,people:[
  {name:'Aaron No Gear',prefix:'AARON',sourceStatus:'scheduled_unconfirmed',
   attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null},
  unmapped.people[0]
 ]};
 const h=harness(board);
 assert.equal(await h.context.departmentAutoScanBurst(),'mapped');
 assert.equal(h.out.scans,2);
 assert.equal(h.out.lookupPosts.length,1);
 assert.equal(h.out.lookupPosts[0].status,'owner_not_found');
 assert.equal(h.out.mapped[0][0].name,'Aaron No Gear');
 assert.equal(h.out.mapped[1][0].name,'Austin Fox');
 assert.equal(h.queue.length,1);
 assert.equal(h.queue[0].personName,'Austin Fox');
 assert.equal(h.out.nav.length,0,'never submits inspection from inventory');
});
test('unexpected source or wrong native link still stops the burst safely',async()=>{
 const h=harness({...unmapped,people:[{...unmapped.people[0],
  knownItems:1,outstandingItems:1,nextItem:{
   assetId:'FOX-MASK-01',inspectionMode:'tour',
   assetPath:'/app/equipment/PPE/pool/299947/222/item'}}]});
 await assert.rejects(()=>h.context.departmentAutoScanBurst(),/invalid/i);
 assert.equal(h.out.nav.length,0);
});
test('per-person read attempts are throttled without marking any PASS',async()=>{
 const h=harness(unmapped);
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(await h.context.departmentAutoOnePass(),'none');
 assert.equal(h.out.scans,1);
});
