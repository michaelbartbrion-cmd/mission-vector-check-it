'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    function departmentOperationalKey(){');
const b=source.indexOf('    async function startCShiftPilotNativeRecheck(',a);
assert.ok(a>0&&b>a);
const feature=source.slice(a,b);
function harness(board){
 const queue=[],state=new Map(),out={mapped:[],nav:[],saved:[],queries:[],errors:[],scans:0,fallback:[],clears:0,opens:0,lookupPosts:[],reusePosts:[]};
 const r={...board};let filterOpen=!r.clearInitiallyHidden;
 const localStore={
  getItem:k=>state.get(k)||null,
  setItem:(k,v)=>state.set(k,String(v)),
  removeItem:k=>state.delete(k)
 };
 const approved=[{name:'Aaron No Gear',prefix:'AARON'},
  {name:'Austin Fox',prefix:'FOX'},{name:'Michael Brion',prefix:'BRION'},
  {name:'Mark Byrd',prefix:'BYRD'}];
 const context={
  Date,Math,JSON,URL,URLSearchParams,
  sessionStorage:localStore,
  C_PILOT_NAMES:new Set(['michael brion']),
  cPilotFetch:async()=>r.pilotBoard??{activeTour:true,tourStart:r.date,people:[{name:'Michael Brion',attendance:'working',dutyDay1:'working',knownItems:10,maskKnownItems:1}]},
  C_PILOT_PENDING_KEY:'test-pending',
  TAB_ID:'ppe-isolated',
  localTodayKey:()=>r.date,
  cPilotBridge:async(method,action,data,query)=>{
   out.queries.push({method,action,query});
   if(action==='vr-ppe-department-lookup-status'){
     assert.equal(method,'POST');out.lookupPosts.push(data);
     return{ok:true,scope:'department-ppe-lookup-status',readOnly:true};
   }
   if(action==='vr-ppe-department-archive-candidates')return{
     scope:'department-ppe-archive-candidates',readOnly:true,
     date:r.date,people:r.archiveCandidates||[]};
    if(action==='vr-ppe-department-archive-reuse'){
     assert.equal(method,'POST');out.reusePosts.push(data);
     return{scope:'department-ppe-archive-reuse',readOnly:true,
      added:r.archiveReuseAdded??12,inspectionSubmitted:false};
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
  (filterOpen?
    (r.clearMissingForever?[]:[{getAttribute:()=>'',innerText:'Clear Filters',click:()=>{out.clears++;filterOpen=false}}]):
    [{getAttribute:()=>'',innerText:'Open filter options',click:()=>{out.opens++;filterOpen=true}}]):[]},
   visible:()=>true,uiEquals:(a,b)=>a===b,sleep:async()=>{},
   responsiblePartySelectionLabels:()=>[],
   scanPpeOwnerSearch:async owner=>{
     out.fallback.push(owner);
      if(r.failSearchSettleFor?.includes(owner.name))
        throw Error('Vector did not confirm a settled PPE search for "'+owner.prefix+'". Scoped PPE search stopped before any inspection or audit.');
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
 return {out,context,queue,state,board:r};
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
test('an already mapped outside-C owner gets first genuine Item Log read before additional owner search',async()=>{
 const item={assetId:'FOX-COAT-01',
   assetPath:'/app/equipment/PPE/pool/300045/111/item',
   inspectionMode:'tour',assetType:'Bunker Coat'};
 const h=harness({...unmapped,people:[
  {name:'Aaron No Gear',prefix:'AARON',sourceStatus:'scheduled_unconfirmed',
   attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null},
  {...unmapped.people[0],knownItems:1,nativeReadItems:0,outstandingItems:1,
   nextItem:item,pendingItems:[item]}
 ]});
 assert.equal(await h.context.departmentAutoOnePass(),'started');
 assert.equal(h.out.nav[0].assetId,'FOX-COAT-01');
 assert.equal(h.out.scans,0,'native Item Log read should precede another fragile search');
 assert.equal(h.out.lookupPosts.length,0);
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
 assert.equal(h.out.lookupPosts.length,2);
 assert.equal(h.out.lookupPosts[0].status,'owner_not_found');
 assert.equal(h.out.lookupPosts[1].status,'native_inventory_mapped');
 assert.equal(h.out.mapped[0][0].name,'Aaron No Gear');
 assert.equal(h.out.mapped[1][0].name,'Austin Fox');
 assert.equal(h.queue.length,1);
 assert.equal(h.queue[0].personName,'Austin Fox');
 assert.equal(h.out.nav.length,0,'never submits inspection from inventory');
});
test('one Vector PPE search timeout advances another real approved owner without inventing an inspection',async()=>{
 const h=harness({...unmapped,people:[
  {name:'Aaron No Gear',prefix:'AARON',sourceStatus:'scheduled_unconfirmed',
    attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null},
  unmapped.people[0]
 ],failSearchSettleFor:['Aaron No Gear']});
 assert.equal(await h.context.departmentAutoScanBurst(),'mapped');
 assert.equal(h.out.scans,2);
 assert.equal(h.out.lookupPosts.length,2);
 assert.equal(h.out.lookupPosts[0].status,'source_error');
 assert.equal(h.out.lookupPosts[1].status,'native_inventory_mapped');
 assert.equal(h.out.mapped[1][0].name,'Austin Fox');
 assert.equal(h.queue.length,1);
 assert.equal(h.out.nav.length,0);
});
test('two unsettled native PPE searches fail closed and do not claim no-work success',async()=>{
 const h=harness({...unmapped,people:[
  {name:'Aaron No Gear',prefix:'AARON',sourceStatus:'scheduled_unconfirmed',
    attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null},
  unmapped.people[0]
 ],failPrimaryFor:['Austin Fox'],
 failSearchSettleFor:['Aaron No Gear','Austin Fox']});
 await assert.rejects(()=>h.context.departmentAutoScanBurst(),
   /Two native PPE surname searches did not settle in one lease/);
 assert.equal(h.out.lookupPosts.length,2);
 assert.deepEqual(h.out.lookupPosts.map(x=>x.status),['source_error','source_error']);
 assert.equal(h.queue.length,0);
 assert.equal(h.out.nav.length,0);
});

test('closed native PPE filter popover reopens and clears before surname search',async()=>{
 const h=harness({...unmapped,failPrimaryFor:['Austin Fox'],clearInitiallyHidden:true});
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.opens,1);
 assert.equal(h.out.clears,1);
 assert.equal(h.queue.length,1);
 assert.equal(h.out.nav.length,0);
});
test('missing native Clear Filters fails closed without a false PPE check',async()=>{
 const h=harness({...unmapped,failPrimaryFor:['Austin Fox'],clearInitiallyHidden:true,clearMissingForever:true});
 await assert.rejects(()=>h.context.departmentAutoOnePass(),/Cannot clear native Responsible Party filter/);
 assert.equal(h.queue.length,0);
 assert.equal(h.out.nav.length,0);
});
test('previously authenticated native PPE history only seeds OUTSTANDING gear for a scheduled owner',async()=>{
 const h=harness({...unmapped,people:[{
  name:'Mark Byrd',prefix:'BYRD',sourceStatus:'scheduled_unconfirmed',
  attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null
 }],archiveCandidates:[{
  personName:'Mark Byrd',personPrefix:'BYRD',knownHistoryItems:12
 }]});
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.reusePosts.length,1);
 assert.equal(h.out.reusePosts[0].personName,'Mark Byrd');
 assert.equal(h.out.reusePosts[0].inspectionSubmitted,false);
 assert.equal(h.out.reusePosts[0].source,'prior_authenticated_native_item_log_readonly');
 assert.equal(h.out.scans,0);
 assert.equal(h.out.nav.length,0);
 assert.equal(h.queue.length,0);
});
test('native FIRST Item Log takes priority over reusing another scheduled owner archive',async()=>{
 const h=harness({...unmapped,totals:{mappedPeople:1},people:[
  {...unmapped.people[0],knownItems:1,nativeReadItems:0,outstandingItems:1,
   nextItem:{assetId:'FOX-COAT-01',inspectionMode:'tour',
    assetPath:'/app/equipment/PPE/pool/300045/111/item'}},
  {name:'Mark Byrd',prefix:'BYRD',sourceStatus:'scheduled_unconfirmed',
   attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null}
 ],archiveCandidates:[{personName:'Mark Byrd',personPrefix:'BYRD',knownHistoryItems:12}]});
 assert.equal(await h.context.departmentAutoOnePass(),'started');
 assert.equal(h.out.reusePosts.length,0,
  'another native archive must not preempt a real first Item Log read');
 assert.equal(h.out.nav.length,1,'genuine existing Item Log reader navigates first');
 assert.equal(h.out.nav[0].assetId,'FOX-COAT-01');
 assert.equal(h.out.scans,0);
 // Only after the native read has genuinely returned to the server may a
 // later lease resume archive-only collection for another scheduled owner.
 h.board.people[0].nativeReadItems=1;
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.reusePosts.length,1);
 assert.equal(h.out.reusePosts[0].personName,'Mark Byrd');
 assert.equal(h.out.reusePosts[0].inspectionSubmitted,false);
 assert.equal(h.out.scans,0,'no duplicate PPE search');
 assert.equal(h.out.nav.length,1,'archive reuse never submits an inspection');
});
test('archived native paths are not reused for already mapped gear',async()=>{
 const h=harness({...unmapped,people:[{...unmapped.people[0],
  knownItems:1,outstandingItems:1,nextItem:{assetId:'FOX-COAT-01',
   assetPath:'/app/equipment/PPE/pool/300045/111/item',inspectionMode:'tour'}}],
   archiveCandidates:[{personName:'Austin Fox',personPrefix:'FOX',knownHistoryItems:12}]});
 assert.equal(await h.context.departmentAutoOnePass(),'started');
 assert.equal(h.out.reusePosts.length,0);
 assert.equal(h.out.nav.length,1);
});

test('background reuses Captain Item Log navigation after verified prior gear mapping',async()=>{
 const h=harness({...unmapped,people:[
  {name:'Mark Byrd',prefix:'BYRD',sourceStatus:'scheduled_unconfirmed',
   attendanceConfirmed:false,knownItems:0,outstandingItems:0,nextItem:null}
 ],archiveCandidates:[{personName:'Mark Byrd',personPrefix:'BYRD',knownHistoryItems:12}]});
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.nav.length,0,'mapping is not an inspection');
 // Simulate the server readback after a verified, OUTSTANDING-only mapping.
 h.board.people[0].knownItems=12;
 h.board.people[0].outstandingItems=12;
 h.board.people[0].nextItem={assetId:'BYRD-COAT-01',
  assetPath:'/app/equipment/PPE/pool/300045/321/item',
  inspectionMode:'tour',assetType:'Bunker Coat'};
 assert.equal(await h.context.departmentAutoOnePass(),'started');
 const audit=h.out.saved.find(x=>x&&x.departmentRecheck);
 assert.ok(audit,'the existing Captain read-only audit state is reused');
 assert.equal(audit.items[0].assetId,'BYRD-COAT-01');
 assert.equal(h.out.nav[0].assetId,'BYRD-COAT-01');
 assert.equal(h.out.scans,0,'no fresh fragile PPE name search');
 assert.equal(h.out.reusePosts.length,1,'prior gear reuse is idempotent');
 assert.equal(h.out.nav.length,1,'one actual Item Log is opened, not an official inspection');
});
test('archived native assets not on today roster cannot be reused',async()=>{
 const h=harness({...unmapped,archiveCandidates:[{
  personName:'Mark Byrd',personPrefix:'BYRD',knownHistoryItems:12
 }]});
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.reusePosts.length,0);
 assert.equal(h.out.scans,1);
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

test('scheduled C-roster firefighter working a different tour remains eligible for department archive reuse',async()=>{
 const h=harness({...unmapped,date:'2026-11-23',pilotBoard:{activeTour:false,people:[]},people:[
   {name:'Michael Brion',prefix:'BRION',sourceStatus:'scheduled_unconfirmed',attendanceConfirmed:false,knownItems:0,outstandingItems:0}
 ],archiveCandidates:[{personName:'Michael Brion',personPrefix:'BRION',knownHistoryItems:12}]});
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.reusePosts.length,1);
 assert.equal(h.out.reusePosts[0].personPrefix,'BRION');
 assert.equal(h.out.reusePosts[0].inspectionSubmitted,false);
 assert.equal(h.out.nav.length,0);
});
test('only confirmed working same-day C pilot with mapped PPE and mask is excluded from duplicate department work',()=>{
 const h=harness(unmapped);const f=h.context.departmentPilotCovered;
 const p={name:'Michael Brion',attendance:'working',dutyDay1:'working',dutyDay2:'off',knownItems:10,maskKnownItems:1};
 assert.equal(f({date:'2026-11-21'},{activeTour:true,tourStart:'2026-11-21',people:[p]}).has('michael brion'),true);
 assert.equal(f({date:'2026-11-22'},{activeTour:true,tourStart:'2026-11-21',people:[p]}).size,0);
 assert.equal(f({date:'2026-11-23'},{activeTour:true,tourStart:'2026-11-21',people:[p]}).size,0);
 assert.equal(f({date:'2026-11-21'},{activeTour:true,tourStart:'2026-11-21',people:[{...p,maskKnownItems:0}]}).size,0);
});

test('partial archived mapping gets current native inventory discovery after known logs are read',async()=>{
 const h=harness({...unmapped,people:[{...unmapped.people[0],knownItems:8,
   nativeReadItems:8,outstandingItems:0,maskKnownItems:0,lookupStatus:'not_attempted'}]});
 assert.equal(await h.context.departmentAutoOnePass(),'mapped');
 assert.equal(h.out.scans,1);
 assert.equal(h.out.nav.length,0);
 assert.equal(h.out.lookupPosts.at(-1).status,'native_inventory_mapped');
 assert.match(h.out.lookupPosts.at(-1).reason,/completeness not asserted/);
});
test('successful current inventory lookup avoids repeated partial searches during same day',async()=>{
 const h=harness({...unmapped,people:[{...unmapped.people[0],knownItems:8,
   nativeReadItems:8,outstandingItems:0,maskKnownItems:0,lookupStatus:'native_inventory_mapped'}]});
 assert.equal(await h.context.departmentAutoOnePass(),'none');
 assert.equal(h.out.scans,0);
});
test('known pending Item Log takes priority over partial inventory rediscovery',async()=>{
 const h=harness({...unmapped,people:[{...unmapped.people[0],knownItems:8,
   nativeReadItems:7,outstandingItems:1,maskKnownItems:0,
   nextItem:{assetId:'FOX-COAT-01',assetPath:'/app/equipment/PPE/pool/300045/111/item',inspectionMode:'tour'}}]});
 assert.equal(await h.context.departmentAutoOnePass(),'started');
 assert.equal(h.out.scans,0);
 assert.equal(h.out.nav.length,1);
});
