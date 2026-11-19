'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function extract(from,to){
 const a=src.indexOf(from),b=src.indexOf(to,a+from.length);
 assert.ok(a>0&&b>a,'Actual Vector Rebel source must contain '+from);
 return src.slice(a,b);
}
const tickSource=extract('    async function cPilotAutoTick(){','    function cPilotEligible(){');
const mapSource=extract("    async function cPilotMapWorkingGear(","    async function cPilotQueueReadOnlyResults");
function tickHarness(input={}){
 const calls={mapped:[],rechecks:[],saved:[]};
 let state={enabled:true,tabId:'one-tab',tourStart:'2026-11-15',nextAt:0,...input.state};
 const data=input.data||{
   activeTour:true,tourStart:'2026-11-21',nextTourStart:'2026-11-27',
   people:[{name:'Michael Brion',prefix:'P-BRION',
     attendance:'working',knownItems:0,outstandingItems:0}]
 };
 const deps={
   cPilotAutoState:()=>state,
   cPilotAutoSave:v=>{state=v;calls.saved.push(v);},
   isMasterOwnerInstallation:()=>true,getRun:()=>null,
   getCaptainDailyCheck:()=>null,captainDailyBusy:false,
   cPilotFetch:async()=>data,cPilotNextLocalBoundaryMs:()=>120000,
   startCShiftPilotNativeRecheck:async dedicated=>{
     calls.rechecks.push(dedicated);return input.startResult??true;
   },
   cPilotMapWorkingGear:async (...args)=>{
     calls.mapped.push(args);return input.mapResult??true;
   }
 };
 const keys=Object.keys(deps);
 const tick=new Function(...keys,tickSource+'; return cPilotAutoTick;')(...keys.map(x=>deps[x]));
 return {tick,calls,readState:()=>state,data};
}
test('armed dedicated tab automatically maps a newly active confirmed C tour once, with no inspection submission',async()=>{
 const h=tickHarness();
 assert.equal(await h.tick(),true);
 assert.deepEqual(h.calls.mapped,[['2026-11-21',true]]);
 assert.equal(h.calls.rechecks.length,0);
 assert.equal(h.readState().tourStart,'2026-11-21');
 assert.equal(h.readState().lastAutoMapTour,'2026-11-21');
 assert.ok(h.readState().nextAt>Date.now());
 assert.equal(await h.tick(),false);
 assert.equal(h.calls.mapped.length,1);
});
test('unconfirmed staffing never causes background inventory mapping or silent attendance',async()=>{
 const h=tickHarness({data:{activeTour:true,tourStart:'2026-11-21',
  people:[{name:'Michael Brion',attendance:'unconfirmed',knownItems:0}]}});
 assert.equal(await h.tick(),true);
 assert.equal(h.calls.mapped.length,0);
 // The existing targeted-read entrypoint runs but finds no confirmed-working
 // candidates and must not create attendance or compliance records.
 assert.deepEqual(h.calls.rechecks,[true]);
});
test('when current gear is mapped the dedicated tab resumes targeted native rechecks without crawling',async()=>{
 const h=tickHarness({data:{activeTour:true,tourStart:'2026-11-21',
   people:[{name:'Michael Brion',attendance:'working',knownItems:10,
     outstandingItems:3,nextItem:'A-01'}]}});
 assert.equal(await h.tick(),true);
 assert.equal(h.calls.mapped.length,0);
 assert.deepEqual(h.calls.rechecks,[true]);
});
test('a failed or pending auto-map has a per-tour cooldown to avoid repeated expensive full inventory scans',async()=>{
 const at=Date.now();
 const h=tickHarness({state:{tourStart:'2026-11-21',nextAt:0,
  lastAutoMapTour:'2026-11-21',lastAutoMapAt:at-300000}});
 assert.equal(await h.tick(),false);
 assert.equal(h.calls.mapped.length,0);
 assert.ok(h.readState().nextAt>=at+24*60000);
});
test('off-shift arming preserves designation for next tour and performs no native action',async()=>{
 const h=tickHarness({data:{activeTour:false,tourStart:'2026-11-15',
  nextTourStart:'2026-11-21',people:[]}});
 assert.equal(await h.tick(),false);
 assert.equal(h.calls.mapped.length,0);
 assert.equal(h.calls.rechecks.length,0);
 assert.equal(h.readState().tourStart,'2026-11-21');
});
function mapHarness({automated=true,working=true,mode='user',approve=false}={}){
 const calls={scans:0,queued:0,confirm:0,scout:0};
 const prefix='PERSON-0DCD2AB48E2A5588';
 const board={activeTour:true,historicalEligible:false,historicalTour:false,
  tourStart:'2026-11-21',
  people:[{name:'Michael Brion',prefix,attendance:working?'working':'unconfirmed'}]};
 const deps={
  isMasterOwnerInstallation:()=>true,panelInterfaceMode:()=>mode,
  setStatus:()=>{},getRun:()=>null,getCaptainDailyCheck:()=>null,
  captainDailyBusy:false,cPilotFetch:async()=>board,
  cPilotScoutSuggestions:async()=>{calls.scout++;return{ok:false,error:'not trusted'};},
  document:{querySelector:()=>({scrollIntoView(){}})},
  confirm:()=>{calls.confirm++;return approve;},
  cPilotBridge:async()=>{throw Error('No duty writes are allowed in test');},
  cPilotCache:null, getActiveMasterRoster:()=>[{name:'Michael Brion',prefix}],
  ensurePpeEquipmentPage:async()=>true,
  scanPpeCrewOwners:async owners=>{
   calls.scans++;return {items:[{ownerName:owners[0].name,assetId:'A-01',type:'Coat',
    url:'https://app.vectorcheckit.us/app/equipment/PPE/pool/123/456/item'}]};
  },
  masterNameKey:x=>String(x||'').toLowerCase(),
  cPilotQueueScopedInventory:(snapshots,scannedAt,tour)=>{
   calls.queued++;assert.equal(snapshots.length,1);
   assert.equal(tour,'2026-11-21');return 1;
  },
  clean:x=>String(x||'').trim()
 };
 const keys=Object.keys(deps);
 const map=new Function(...keys,mapSource+'; return cPilotMapWorkingGear;')(...keys.map(k=>deps[k]));
 return{map,calls};
}
test('previously armed background tab can map confirmed duty gear without a dialog even in User mode',async()=>{
 const h=mapHarness();
 assert.equal(await h.map('2026-11-21',true),true);
 assert.deepEqual({scans:h.calls.scans,queued:h.calls.queued,confirm:h.calls.confirm,scout:h.calls.scout},
   {scans:1,queued:1,confirm:0,scout:0});
});
test('automated inventory never confirms unknown attendance, scans gear, or writes duty',async()=>{
 const h=mapHarness({working:false});
 assert.equal(await h.map('2026-11-21',true),false);
 assert.equal(h.calls.confirm,0);assert.equal(h.calls.scout,0);
 assert.equal(h.calls.scans,0);assert.equal(h.calls.queued,0);
});
test('manual map still requires the operator confirmation before reading Vector inventory',async()=>{
 const h=mapHarness({automated:false,mode:'master'});
 assert.equal(await h.map('2026-11-21',false),false);
 assert.equal(h.calls.confirm,1);
 assert.equal(h.calls.scans,0);assert.equal(h.calls.queued,0);
});

test('an unsuccessful auto-map is not reported as a completed verification and will not immediately repeat',async()=>{
 const h=tickHarness({mapResult:false});
 assert.equal(await h.tick(),false);
 assert.equal(h.calls.rechecks.length,0);
 assert.equal(h.calls.mapped.length,1);
 assert.equal(await h.tick(),false);
 assert.equal(h.calls.mapped.length,1);
 assert.equal(h.readState().lastAutoMapTour,'2026-11-21');
});
test('Captain and BC distinguish armed monitoring from an actual native Item Log read',()=>{
 assert.match(src,/ARMED \(waiting for captain-confirmed staffing\)/);
 assert.match(src,/ARMED \(will map working PPE\)/);
 assert.match(src,/READING NATIVE ITEM LOGS/);
 assert.match(src,/ARMED \(next native read pending\)/);
 assert.doesNotMatch(src,/SIGNED-IN TAB ACTIVE/);
});
