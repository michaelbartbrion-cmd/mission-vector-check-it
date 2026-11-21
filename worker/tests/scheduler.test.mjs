import test from 'node:test';
import assert from 'node:assert/strict';
import{initialState,chicagoClock,eligible,claim,complete,
  retireExpiredLease,health,POLICY}from'../scheduler.mjs';
const chicago=(date,hour)=>new Date(date+'T'+hour+':00:00-06:00');
const tab=(role,now)=>({role,tabId:'enterprise-test-tab-1',ready:true,
  dedicated:true,busy:false,seenAtMs:now.getTime()});
test('America/Chicago operational date follows 07:00 boundary',()=>{
 assert.equal(chicagoClock(chicago('2026-11-21','06')).opDate,'2026-11-20');
 assert.equal(chicagoClock(chicago('2026-11-21','07')).opDate,'2026-11-21');
 assert.equal(chicagoClock(new Date('2026-07-01T11:59:00Z')).opDate,'2026-06-30');
 assert.equal(chicagoClock(new Date('2026-07-01T12:01:00Z')).opDate,'2026-07-01');
});
test('requires authenticated dedicated browser heartbeat, never starts a crawler alone',()=>{
 const now=chicago('2026-11-21','08'),s=initialState();
 for(const absent of [null,{...tab('staffing',now),ready:false},
   {...tab('staffing',now),dedicated:false},
   {...tab('staffing',now),seenAtMs:now.getTime()-100000},
   {...tab('staffing',now),busy:true}]){
  assert.equal(eligible(s,'staffing',absent,now).allowed,false);
 }
 assert.equal(eligible(s,'staffing',tab('staffing',now),now).allowed,true);
});
test('single global lease, midnight/day turnover, and completion idempotence',()=>{
 const now=chicago('2026-11-21','08'),s=initialState();
 const a=claim(s,'staffing',tab('staffing',now),now);
 assert.equal(a.granted,true);
 assert.equal(claim(s,'ppe',tab('ppe',now),now).granted,false);
 assert.equal(complete(s,'staffing','wrong-tab',a.id,'success',now).ok,false);
 assert.equal(complete(s,'staffing',tab('staffing',now).tabId,a.id,
  'success',now).recorded,true);
 assert.equal(complete(s,'staffing',tab('staffing',now).tabId,a.id,
  'success',now).recorded,undefined);
 assert.equal(eligible(s,'staffing',tab('staffing',now),now).allowed,false);
 assert.equal(s.staffing.lastSuccessDate,'2026-11-21');
 assert.equal(s.staffing.lastSuccessSlot,'turnover');
});
test('midday staffing refresh allowed once after morning and then freezes',()=>{
 const now=chicago('2026-11-21','08'),s=initialState();
 let c=claim(s,'staffing',tab('staffing',now),now);
 complete(s,'staffing',tab('staffing',now).tabId,c.id,'success',now);
 const midday=chicago('2026-11-21','13');
 c=claim(s,'staffing',tab('staffing',midday),midday);
 assert.equal(c.granted,true);
 complete(s,'staffing',tab('staffing',midday).tabId,c.id,'success',midday);
 assert.equal(eligible(s,'staffing',tab('staffing',midday),
   new Date(midday.getTime()+3*60*60*1000)).allowed,false);
});
test('PPE job is spaced nine minutes and strictly daily bounded',()=>{
 const now=chicago('2026-11-21','08'),s=initialState();
 const p=tab('ppe',now),a=claim(s,'ppe',p,now);
 assert.equal(a.granted,true);
 assert.equal(a.kind,'ppe-one-readonly-rotation');
 assert.equal(complete(s,'ppe',p.tabId,a.id,'no_work',now).ok,true);
 assert.equal(eligible(s,'ppe',tab('ppe',
   new Date(now.getTime()+8*60000)),new Date(now.getTime()+8*60000)).allowed,false);
 assert.equal(eligible(s,'ppe',tab('ppe',
   new Date(now.getTime()+10*60000)),new Date(now.getTime()+10*60000)).allowed,true);
 s.ppe.count=POLICY.ppeDailyLimit;s.ppe.countDate='2026-11-21';
 assert.equal(eligible(s,'ppe',tab('ppe',
   new Date(now.getTime()+11*60000)),new Date(now.getTime()+11*60000)).allowed,false);
});
test('failed source never becomes verified completion and backs off',()=>{
 const now=chicago('2026-11-21','08'),s=initialState();
 const a=claim(s,'ppe',tab('ppe',now),now);
 assert.equal(complete(s,'ppe',a.id,'wrong-token','success',now).ok,false);
 assert.equal(complete(s,'ppe',tab('ppe',now).tabId,a.id,'auth_required',now).ok,true);
 assert.equal(s.ppe.lastSuccessAt,undefined);
 const later=new Date(now.getTime()+15*60*1000);
 assert.equal(eligible(s,'ppe',tab('ppe',later),later).why,'ppe_failure_backoff');
});
test('stale lease expires and retries are delayed without overlapping tasks',()=>{
 const now=chicago('2026-11-21','08'),s=initialState();
 const a=claim(s,'staffing',tab('staffing',now),now);
 const t=now.getTime()+POLICY.staffingLeaseMs+1;
 assert.equal(retireExpiredLease(s,t),true);
 assert.equal(s.lease,null);
 assert.equal(s.staffing.lastFailureMs,t);
 assert.equal(eligible(s,'staffing',tab('staffing',new Date(t)),new Date(t)).allowed,false);
 assert.equal(complete(s,'staffing',a.tabId,a.id,'success',new Date(t)).ok,false);
});
test('status is compact and contains no PPE, staffing identities, or login data',()=>{
 const s=initialState(),n=chicago('2026-11-21','08');
 const view=health(s,[],n);
 assert.equal(view.mode,'read_only');
 assert.equal(view.limits.concurrency,1);
 assert.equal(view.limits.noCredentialStorage,true);
 assert.equal(view.staffing.clientState,'offline');
 assert.equal(view.ppe.clientState,'offline');
 assert.equal(JSON.stringify(view).includes('person_name'),false);
});
