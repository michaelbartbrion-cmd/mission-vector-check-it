'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    function departmentOperationalKey(){');
const b=source.indexOf('    async function startCShiftPilotNativeRecheck(',a);
assert.ok(a>0&&b>a);
const feature=source.slice(a,b);
function harness(board){
 const queue=[],state=new Map(),out={mapped:[],nav:[],saved:[],queries:[],errors:[],scans:0};
 const r={...board};
 const localStore={
  getItem:k=>state.get(k)||null,
  setItem:(k,v)=>state.set(k,String(v)),
  removeItem:k=>state.delete(k)
 };
 const approved=[{name:'Austin Fox',prefix:'FOX'},{name:'Michael Brion',prefix:'BRION'}];
 const context={
  Date,Math,JSON,URL,URLSearchParams,
  sessionStorage:localStore,
  C_PILOT_NAMES:new Set(['michael brion']),
  C_PILOT_PENDING_KEY:'test-pending',
  TAB_ID:'ppe-isolated',
  localTodayKey:()=>r.date,
  cPilotBridge:async(method,action,data,query)=>{
   out.queries.push({method,action,query});
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
   return{ownerErrors:[],items:[{assetId:'FOX-COAT-01',ownerName:'Austin Fox',
     type:'Bunker Coat',pool:'300045',url:'https://checkitapp.targetsolutions.com/app/equipment/PPE/pool/300045/111/item'}]};},
  cPilotNativePath:u=>new URL(u,'https://checkitapp.targetsolutions.com').pathname,
  SCBA_FACE_MASK_POOL:'299947',
  BUILTIN_MODES:{tour:{templates:{'300045':'112411'}}},
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
test('per-person read attempts are throttled without marking any PASS',async()=>{
 const h=harness(unmapped);
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(await h.context.departmentAutoOnePass(),'none');
 assert.equal(h.out.scans,1);
});
