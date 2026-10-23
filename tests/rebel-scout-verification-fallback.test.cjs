'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-scout.user.js'),'utf8');
const a=src.indexOf('async function verifyFailedStaffingDates(q){'),b=src.indexOf('async function finishOrExtend(q){',a);
assert.ok(a>=0&&b>a);
const fn=src.slice(a,b);
const valid={ok:true,verificationOnly:true,completePlanAvailable:false,
 captures:[{workDate:'2027-07-29',quality:'good',capturedAt:new Date().toISOString()}]};
function harness(result=valid){
 let requested='',received;
 const verifier=new Function('core','reconcileVerifiedStaffingFailures',fn+'\nreturn verifyFailedStaffingDates;')({
  request:async q=>{requested=q;return result}
 },(q,plan)=>{received=plan;return plan.captures.filter(x=>x.quality==='good').length});
 return {verifier,request:()=>requested,plan:()=>received};
}
const q=()=>({finalFailures:[{key:'staffing:2027-07-29'},{key:'overtime:2027-07-30'}]});
test('Fallback checks only failed staffing dates via the bounded read-only server endpoint',async()=>{
 const h=harness(),n=await h.verifier(q());
 assert.equal(n,1);
 assert.match(h.request(),/^\?action=verify-staffing-captures&dates=2027-07-29$/);
 assert.deepEqual(h.plan().worklist,[]);
});
test('Fallback never treats unverified date as successful and does not check OT as staffing',async()=>{
 const h=harness({...valid,captures:[{workDate:'2027-07-29',quality:'unverified'}]});
 assert.equal(await h.verifier(q()),0);
 assert.deepEqual(h.plan().worklist,[{type:'staffing',workDate:'2027-07-29'}]);
});
test('Malformed endpoint response fails closed rather than asserting sync completion',async()=>{
 for(const r of [{ok:true,captures:[]},{ok:true,verificationOnly:true,completePlanAvailable:true,captures:[]},{ok:false}]){
  await assert.rejects(harness(r).verifier(q()),/not available/);
 }
});
test('Full sync plan failure only triggers date-level verification and still reports unknown remaining work',()=>{
 const flow=src.slice(src.indexOf('async function finishOrExtend(q){'),src.indexOf('async function runQueue(){'));
 assert.match(flow,/catch\(e\)\{let recovered=0;try\{recovered=await verifyFailedStaffingDates\(q\)\}/);
 assert.match(flow,/Final server freshness check was unavailable/);
 assert.match(flow,/so Scout could not ask whether any additional stale dates remain/);
});
