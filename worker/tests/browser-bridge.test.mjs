import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.join(import.meta.dirname,'..','..','beta');
const scout=fs.readFileSync(path.join(root,'rebel-scout.user.js'),'utf8');
const vector=fs.readFileSync(path.join(root,'vector-rebel.user.js'),'utf8');
const scoutScript=scout.slice(scout.indexOf('/* Enterprise-only, no-UI bridge.'));
const first=vector.indexOf('    (function attachEnterpriseSlowBackground(){');
const last=vector.indexOf('    })();',first)+'    })();'.length;
assert.ok(first>0&&last>first);
const ppeScript=vector.slice(first,last);
function storage(){
 const values=new Map();
 return{getItem:x=>values.has(x)?values.get(x):null,
  setItem:(x,v)=>values.set(x,String(v)),
  removeItem:x=>values.delete(x)};
}
function transport(){
 const calls=[];let tasks=0;
 const request=options=>{
  const role=JSON.parse(options.data).role;
  const data=JSON.parse(options.data);
  const route=new URL(options.url).pathname;
  calls.push({role,route,...data});
  let payload={ok:true};
  if(route==='/v1/claim')payload={ok:true,granted:++tasks===1,
    id:'3ab60fd7-5be9-4a1c-aacb-110000000001',
    workDate:'2026-11-21',kind:role==='ppe'?
      'ppe-one-readonly-rotation':'staffing-current-day'};
  queueMicrotask(()=>options.onload({status:200,
    responseText:JSON.stringify(payload)}));
 };
 return{calls,request};
}
async function flush(){for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));}
test('Scout browser bridge only wakes in a dedicated tab and reports verified full census completion',async()=>{
 const t=transport(),tab=storage(),tasks=[],intervals=[];
 const status={paired:true,queue:{active:false}};
 let launched=0;
 const context={window:{MVCI_REBEL_SCOUT:{
   status:()=>status,
   startEnterpriseCurrentStaffing:async(date)=>{
    assert.equal(date,'2026-11-21');launched++;
    status.queue={active:true,operationalDate:date};
    return true;
   }
 }},sessionStorage:tab,
 location:{search:'?mvci_worker=staffing'},
 URLSearchParams,Date,Math,JSON,GM_xmlhttpRequest:t.request,
 setTimeout:fn=>tasks.push(fn),setInterval:fn=>intervals.push(fn)};
 vm.runInNewContext(scoutScript,context);
 assert.equal(tasks.length,1);
 tasks[0]();await flush();
 assert.equal(launched,1);
 assert.ok(t.calls.some(c=>c.route==='/v1/heartbeat'));
 assert.ok(t.calls.some(c=>c.route==='/v1/claim'));
 status.queue={active:false,operationalDate:'2026-11-21',
  successKeys:['staffing:2026-11-21'],finalFailures:[]};
 intervals[0]();await flush();
 const done=t.calls.find(c=>c.route==='/v1/complete');
 assert.equal(done?.outcome,'success');
 assert.equal(t.calls.length,4);
});
test('Scout on an ordinary CrewSense tab does not use enterprise loopback',()=>{
 const tab=storage(),t=transport(),callbacks=[];
 vm.runInNewContext(scoutScript,{window:{},sessionStorage:tab,
  location:{search:''},URLSearchParams,Date,Math,JSON,
  GM_xmlhttpRequest:t.request,setTimeout:f=>callbacks.push(f),
  setInterval:f=>callbacks.push(f)});
 assert.equal(callbacks.length,0);
 assert.equal(t.calls.length,0);
});
test('tagged dedicated PPE startup cleans the broken Vector Equipment query in the SAME tab',()=>{
 const tab=storage(),redirects=[],callbacks=[];
 const location={search:'?mvci_worker=ppe',pathname:'/main/asset-manager',
  origin:'https://checkitapp.targetsolutions.com',
  replace:url=>redirects.push(url)};
 vm.runInNewContext(ppeScript,{
  sessionStorage:tab,location,URLSearchParams,Date,Math,JSON,
  TAB_ID:'ppe-tagged-boot',
  setTimeout:f=>callbacks.push(f),setInterval:f=>callbacks.push(f)
 });
 assert.equal(tab.getItem('mvciEnterpriseDedicatedRoleV1'),'ppe');
 assert.deepEqual(redirects,['https://checkitapp.targetsolutions.com/main/asset-manager']);
 assert.equal(callbacks.length,0,'the broken page must not claim a lease');
});
test('same-tab clean Vector Equipment URL retains the dedicated PPE collector without a second redirect',()=>{
 const tab=storage(),callbacks=[],intervals=[];
 tab.setItem('mvciEnterpriseDedicatedRoleV1','ppe');
 vm.runInNewContext(ppeScript,{
  sessionStorage:tab,
  location:{search:'',pathname:'/main/asset-manager',origin:'https://checkitapp.targetsolutions.com',
   replace:()=>assert.fail('clean page should not redirect again')},
  URLSearchParams,Date,Math,JSON,TAB_ID:'ppe-clean-boot',
  setTimeout:f=>callbacks.push(f),setInterval:f=>intervals.push(f)
 });
 assert.equal(callbacks.length,1);
 assert.equal(intervals.length,1);
});
test('tagged native Item Log route is not redirected or counted as an inspection',()=>{
 const tab=storage(),callbacks=[];
 vm.runInNewContext(ppeScript,{
  sessionStorage:tab,location:{search:'?mvci_worker=ppe',
   pathname:'/app/equipment/PPE/pool/300045/111/item',
   origin:'https://checkitapp.targetsolutions.com',
   replace:()=>assert.fail('native Item Log must not be redirected')},
  URLSearchParams,Date,Math,JSON,TAB_ID:'ppe-item-route',
  setTimeout:f=>callbacks.push(f),setInterval:()=>{}
 });
 assert.equal(tab.getItem('mvciEnterpriseDedicatedRoleV1'),'ppe');
 assert.equal(callbacks.length,1);
});

test('PPE bridge protects an active Captain check and completes only after native read results',async()=>{
 const t=transport(),tab=storage(),callbacks=[],intervals=[];
 let captainBusy=true,started=0;
 const context={
  sessionStorage:tab,location:{search:'?mvci_worker=ppe',pathname:'/main'},
  URLSearchParams,Date,Math,JSON,TAB_ID:'vcppe-enterprise-test',
  GM_xmlhttpRequest:t.request,
  isMasterOwnerInstallation:()=>true,rebelCommandPaired:()=>true,findVectorNavigationTarget:()=>({}),
  getRun:()=>null,getCaptainDailyCheck:()=>captainBusy?{}:null,
  captainDailyBusy:false,
  startCShiftPilotNativeRecheck:async()=>{started++;captainBusy=true;return true},
  setTimeout:fn=>callbacks.push(fn),setInterval:fn=>intervals.push(fn)
 };
 vm.runInNewContext(ppeScript,context);
 callbacks[0]();await flush();
 assert.equal(started,0);
 assert.equal(t.calls.filter(c=>c.route==='/v1/claim').length,0);
 captainBusy=false;
 intervals[0]();await flush();
 assert.equal(started,1);
 captainBusy=false;
 const claimedAt=Date.now();
 tab.setItem('mvciEnterprisePpeOutcomeV1',
  JSON.stringify({at:claimedAt+1000,queued:1,unreadable:0,
   delivered:true}));
 intervals[0]();await flush();
 const done=t.calls.find(c=>c.route==='/v1/complete');
 assert.equal(done?.outcome,'success');
 assert.ok(!tab.getItem('mvciEnterprisePpeLeaseV1'));
});
test('PPE ordinary browser tab never starts native collection',()=>{
 const tab=storage(),callbacks=[],t=transport();
 vm.runInNewContext(ppeScript,{sessionStorage:tab,location:{search:''},
  URLSearchParams,Date,Math,JSON,TAB_ID:'ppe-normal-test',
  GM_xmlhttpRequest:t.request,setTimeout:fn=>callbacks.push(fn),
  setInterval:fn=>callbacks.push(fn)});
 assert.equal(callbacks.length,0);
 assert.equal(t.calls.length,0);
});
test('source collector bridges do not call official inspection submit or CrewSense edits',()=>{
 assert.match(vector,/const candidates=dedicated&&eligible\.length\?/);
 assert.match(vector,/if\(getRun\(\)\|\|getCaptainDailyCheck\(\)\|\|captainDailyBusy\)/);
 assert.match(vector,/mvciEnterprisePpeOutcomeV1/);
 assert.match(scout,/startEnterpriseCurrentStaffing/);
 assert.match(scout,/items:\[item\]/);
 assert.match(vector,/\(query\?\.date\?'&date='\+encodeURIComponent\(query\.date\)/);
 assert.match(scout,/\/\/ @connect\s+127\.0\.0\.1/);
 assert.match(vector,/\/\/ @connect\s+127\.0\.0\.1/);
 for(const fragment of [scoutScript,ppeScript]){
  assert.doesNotMatch(fragment,/submitInspection\(|Commit One Schedule|CrewSense\.update/);
 }
});

test('one-step native PPE scanner accepts only approved mask mode and pool',()=>{
 const start=vector.indexOf('    function cPilotDirectTarget(');
 const end=vector.indexOf('    function cPilotQueueScopedInventory(',start);
 assert.ok(start>0&&end>start);
 const one=new Function('clean','location',vector.slice(start,end)+
  '\nreturn cPilotDirectTarget;')(
  x=>String(x||'').trim(),{origin:'https://app.vectorcheckit.us'});
 const row={attendance:'working',name:'Firefighter',prefix:'PERSON-TEST',
  nextRequiredItem:'MASK-100',
  nextRequiredPath:'/app/equipment/PPE/pool/299947/4605913/item',
  nextRequiredMode:'scbaTour'};
 const valid=one(row);
 assert.equal(valid.inspectionModeKey,'scbaTour');
 assert.equal(valid.assetId,'MASK-100');
 assert.equal(valid.pool,'299947');
 assert.equal(one({...row,nextRequiredPath:
   '/app/equipment/PPE/pool/300082/4605913/item'}),null);
 assert.equal(one({...row,attendance:'off'}),null);
 const ppe=one({...row,nextRequiredItem:'COAT-100',
  nextRequiredMode:'tour',
  nextRequiredPath:'/app/equipment/PPE/pool/300082/4605913/item'});
 assert.equal(ppe.inspectionModeKey,'tour');
});

test('Enterprise PPE bridge auto-maps captain-confirmed unmapped gear as inventory, not a native inspection',async()=>{
  const t=transport(),tab=storage(),callbacks=[],intervals=[];
  let mapped=0,native=0;
  const context={
    sessionStorage:tab,location:{search:'?mvci_worker=ppe',pathname:'/main'},
    URLSearchParams,Date,Math,JSON,TAB_ID:'mvci-autmap-pass',
    GM_xmlhttpRequest:t.request,
    isMasterOwnerInstallation:()=>true,rebelCommandPaired:()=>true,findVectorNavigationTarget:()=>({}),
    getRun:()=>null,getCaptainDailyCheck:()=>null,captainDailyBusy:false,
    cPilotFetch:async()=>({activeTour:true,tourStart:'2026-11-21',
      people:[{name:'Working Firefighter',attendance:'working',knownItems:0},
        {name:'Off Firefighter',attendance:'off',knownItems:0}]}),
    cPilotMapWorkingGear:async(tour,automated)=>{
      assert.equal(tour,'2026-11-21');assert.equal(automated,true);
      mapped++;return true;
    },
    startCShiftPilotNativeRecheck:async()=>{native++;return true},
    setTimeout:fn=>callbacks.push(fn),setInterval:fn=>intervals.push(fn),
  };
  vm.runInNewContext(ppeScript,context);
  callbacks[0]();await flush();
  assert.equal(mapped,1,'unmapped confirmed worker must be scanned once');
  assert.equal(native,0,'mapping is not an Item Log read');
  const complete=t.calls.find(c=>c.route==='/v1/complete');
  assert.equal(complete?.outcome,'no_work','mapping must not count as verified PPE history');
  assert.ok(!tab.getItem('mvciEnterprisePpeLeaseV1'));
  const backoff=JSON.parse(tab.getItem('mvciEnterprisePpeAutoMapV1'));
  assert.equal(backoff?.tourStart,'2026-11-21');
  assert.ok(Number(backoff.at)>0);
});

test('Enterprise PPE auto-map refuses to invent work or a completed inspection when owner scan fails',async()=>{
  const t=transport(),tab=storage(),callbacks=[],intervals=[];
  let mapped=0,native=0;
  vm.runInNewContext(ppeScript,{
    sessionStorage:tab,location:{search:'?mvci_worker=ppe',pathname:'/main'},
    URLSearchParams,Date,Math,JSON,TAB_ID:'mvci-automap-fail',
    GM_xmlhttpRequest:t.request,
    isMasterOwnerInstallation:()=>true,rebelCommandPaired:()=>true,findVectorNavigationTarget:()=>({}),
    getRun:()=>null,getCaptainDailyCheck:()=>null,captainDailyBusy:false,
    cPilotFetch:async()=>({activeTour:true,tourStart:'2026-11-21',
      people:[{name:'Not yet confirmed',attendance:'unconfirmed',knownItems:0},
        {name:'Real working owner',attendance:'working',knownItems:0}]}),
    cPilotMapWorkingGear:async()=>{mapped++;return false},
    startCShiftPilotNativeRecheck:async()=>{native++;return true},
    setTimeout:fn=>callbacks.push(fn),setInterval:fn=>intervals.push(fn)
  });
  callbacks[0]();await flush();
  assert.equal(mapped,1,'only the working owner makes a scan eligible');
  assert.equal(native,0,'never claim native inspection success from failed mapping');
  assert.equal(t.calls.find(c=>c.route==='/v1/complete')?.outcome,'error');
  assert.ok(!tab.getItem('mvciEnterprisePpeLeaseV1'));
});

test('paired Vector login screen cannot claim a PPE lease and reports not ready',async()=>{
 const tab=storage(),t=transport(),callbacks=[],intervals=[];
 const context={sessionStorage:tab,location:{search:'?mvci_worker=ppe',pathname:'/login'},
  URLSearchParams,Date,Math,JSON,TAB_ID:'ppe-login-test',
  GM_xmlhttpRequest:t.request,isMasterOwnerInstallation:()=>true,rebelCommandPaired:()=>true,findVectorNavigationTarget:()=>({}),
  findVectorNavigationTarget:()=>null,getRun:()=>null,getCaptainDailyCheck:()=>null,captainDailyBusy:false,
  setTimeout:f=>callbacks.push(f),setInterval:f=>intervals.push(f)};
 vm.runInNewContext(ppeScript,context);
 callbacks[0]();await flush();
 assert.equal(t.calls.find(c=>c.route==='/v1/heartbeat')?.ready,false);
 assert.equal(t.calls.filter(c=>c.route==='/v1/claim').length,0);
 context.location.pathname='/main/asset-manager';
 intervals[0]();await flush();
 assert.equal(t.calls.filter(c=>c.route==='/v1/claim').length,0,'blank authenticated route is not sufficient either');
});

test('PPE keeps its existing broker heartbeat live during a long native owner lookup without claiming another lease',async()=>{
 const t=transport(),tab=storage(),callbacks=[],intervals=[];
 let resolveLookup;const lookup=new Promise(r=>{resolveLookup=r});
 let entered=0;
 const ctx={sessionStorage:tab,location:{search:'?mvci_worker=ppe',pathname:'/main'},
  URLSearchParams,Date,Math,JSON,TAB_ID:'ppe-slow-lookup',
  GM_xmlhttpRequest:t.request,isMasterOwnerInstallation:()=>true,rebelCommandPaired:()=>true,
  findVectorNavigationTarget:()=>({}),getRun:()=>null,getCaptainDailyCheck:()=>null,captainDailyBusy:false,
  departmentAutoScanBurst:async()=>{entered++;return lookup},
  setTimeout:f=>callbacks.push(f),setInterval:f=>intervals.push(f)};
 vm.runInNewContext(ppeScript,ctx);callbacks[0]();await flush();assert.equal(entered,1);
 intervals[0]();await flush();
 assert.equal(t.calls.filter(c=>c.route==='/v1/claim').length,1);
 assert.equal(t.calls.filter(c=>c.route==='/v1/heartbeat').at(-1).busy,true);
 resolveLookup('mapped');await flush();
 assert.equal(t.calls.at(-2).route,'/v1/heartbeat');
 assert.equal(t.calls.at(-1).route,'/v1/complete');
 assert.equal(t.calls.at(-1).outcome,'no_work');
 assert.equal(t.calls.filter(c=>c.route==='/v1/complete').length,1);
});
