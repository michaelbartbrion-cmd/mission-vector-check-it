'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-scout.user.js'),'utf8');
const from=src.indexOf('function reconcileVerifiedStaffingFailures(q,plan){');
const until=src.indexOf('async function finishOrExtend(q){',from);
assert.ok(from>=0&&until>from);
const reconcile=new Function(src.slice(from,until)+'\nreturn reconcileVerifiedStaffingFailures;')();
const time=Date.now();
const stamp=new Date(time-1000).toISOString();
const failure={key:'staffing:2027-07-05',message:'sent-partial',attempts:3};
const input=()=>({startedAt:time-5000,successKeys:['staffing:2027-07-06'],
  finalFailures:[{...failure}],recoveredKeys:[]});
const plan=()=>({captures:[{workDate:'2027-07-05',quality:'good',capturedAt:stamp}],
 worklist:[],config:{captureQueryTruncated:false}});
test('Reconciles a locally failed date only after new independent server GOOD evidence',()=>{
 const q=input();const n=reconcile(q,plan());
 assert.equal(n,1);assert.deepEqual(q.finalFailures,[]);
 assert.deepEqual(q.successKeys,['staffing:2027-07-06','staffing:2027-07-05']);
 assert.deepEqual(q.recoveredKeys,['staffing:2027-07-05']);
 assert.equal(reconcile(q,plan()),0);
});
test('Never suppress failures when the server still requests that date',()=>{
 const q=input();const p=plan();p.worklist=[{type:'staffing',workDate:'2027-07-05'}];
 assert.equal(reconcile(q,p),0);assert.equal(q.finalFailures.length,1);
});
test('Stale, partial, absent, truncated, or malformed server data cannot clear failures',()=>{
 for(const mutate of [
  p=>p.captures[0].quality='partial',
  p=>p.captures[0].capturedAt=new Date(time-15000).toISOString(),
  p=>p.captures=[],
  p=>p.config.captureQueryTruncated=true,
  p=>delete p.worklist,
  p=>p.captures[0].workDate='2027-07-08'
 ]){const q=input(),p=plan();mutate(p);assert.equal(reconcile(q,p),0);assert.equal(q.finalFailures.length,1);}
});
test('Failures in OT must never be reported as recovered by staffing evidence',()=>{
 const q=input();q.finalFailures=[{key:'overtime:2027-07-05',message:'no ranking'}];
 assert.equal(reconcile(q,plan()),0);assert.equal(q.finalFailures.length,1);
});
test('Final sync calls reconciliation exactly after a successful read-only server plan',()=>{
 const flow=src.slice(src.indexOf('async function finishOrExtend(q){'),src.indexOf('async function runQueue(){'));
 assert.match(flow,/const recovered=reconcileVerifiedStaffingFailures\(q,plan\)/);
 assert.match(flow,/Background batch complete: \$\{good\} checks verified/);
 assert.match(flow,/independently confirmed by the server/);
 assert.doesNotMatch(flow,/reconcileVerifiedStaffingFailures\(q,\{\}\)/);
});
