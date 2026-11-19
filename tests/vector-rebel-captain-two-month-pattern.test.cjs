'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=src.indexOf('    function captainTwoMonthItemPattern(item,window){');
const end=src.indexOf('    function showCaptainDailyReport(',start);
assert.ok(start>0&&end>start,'Actual two-month trend helper must be present');
const pattern=new Function(src.slice(start,end)+'\nreturn captainTwoMonthItemPattern;')();
const window={asOfDate:'2026-11-19',tours:[
 ['2026-10-01','2026-10-02'],['2026-10-07','2026-10-08'],
 ['2026-10-13','2026-10-14'],['2026-10-19','2026-10-20'],
 ['2026-11-01','2026-11-02'],['2026-11-19','2026-11-20']]
 .map(([startDate,endDate])=>({startDate,endDate}))};
const check=(startDate,attrs)=>({startDate,due:true,off:false,unknown:false,ok:false,date:'',assignmentSource:'scout_any_unit',...attrs});
test('per-person per-PPE history detects repeated verified missing tours, not just a single gap',()=>{
 const coat={status:'ok',tourChecks:[
  check('2026-10-01',{ok:true,date:'2026-10-01'}),
  check('2026-10-07',{ok:false}),
  check('2026-10-13',{ok:false}),
  check('2026-10-19',{off:true,due:false}),
  check('2026-11-01',{ok:true,date:'2026-11-01'}),
  check('2026-11-19',{due:true,ok:false}),
  check('2026-08-03',{due:true,ok:false})]};
 const r=pattern(coat,window);
 assert.deepEqual({required:r.required,verified:r.verified,missing:r.missing,
  off:r.off,repeated:r.repeated,label:r.label},
  {required:4,verified:2,missing:2,off:1,repeated:true,label:'REPEATED MISSING'});
});
test('ongoing tour is not counted as a repeated missed check even if currently due',()=>{
 const r=pattern({status:'ok',tourChecks:[
  check('2026-10-01',{ok:false}),
  check('2026-11-19',{ok:false})]},window);
 assert.equal(r.missing,1);
 assert.equal(r.repeated,false);
 assert.equal(r.required,1);
});
test('roster-only expected tours cannot become an invented repeated-miss pattern',()=>{
 const r=pattern({status:'ok',tourChecks:[
  check('2026-10-01',{assignmentSource:'base_roster_inferred'}),
  check('2026-10-07',{assignmentSource:''}),
  check('2026-10-13',{assignmentSource:'scout_any_unit',ok:false})]},window);
 assert.equal(r.missing,1);
 assert.equal(r.dutyUnverified,2);
 assert.equal(r.uncertain,2);
 assert.equal(r.repeated,false);
 assert.equal(r.label,'1 MISSING');
});
test('unreadable native history is unknown, never two false misses',()=>{
 const r=pattern({status:'error',tourChecks:[
  check('2026-10-01',{}),check('2026-10-07',{}),
  check('2026-10-13',{due:false,unknown:true})]},window);
 assert.equal(r.missing,0);
 assert.equal(r.repeated,false);
 assert.equal(r.unreadable,2);
 assert.equal(r.uncertain,3);
 assert.equal(r.label,'STATUS UNKNOWN');
});
test('unconfirmed attendance, OFF and unassigned are excluded from missed checks',()=>{
 const r=pattern({status:'ok',tourChecks:[
  check('2026-10-01',{due:false,unknown:true}),
  check('2026-10-07',{due:false,off:true}),
  check('2026-10-13',{due:false,notAssigned:true}),
  check('2026-10-19',{due:true,ok:true,date:'2026-10-19'})]},window);
 assert.equal(r.missing,0);
 assert.equal(r.verified,1);
 assert.equal(r.required,1);
 assert.equal(r.attendanceUnknown,1);
 assert.equal(r.off,1);
 assert.equal(r.unassigned,1);
 assert.equal(r.repeated,false);
});
test('current Captain and BC board exposes cached original two-month history as a primary control, no new audit on view',()=>{
 const from=src.indexOf('    function showCShiftPilotBoard(');
 const to=src.indexOf('    let lastInterfaceErrorInboxPoll',from);
 const body=src.slice(from,to);
 assert.match(body,/makeButton\('2-Month PPE History'/);
 assert.match(body,/controls\.insertBefore\(history,close\)/);
 assert.match(body,/if\(cached\)\{showCaptainDailyReport\(cached\);return;\}/);
 assert.match(body,/void launchCaptainDailyCheckFromAnywhere\(\)/);
 assert.match(body,/Snapshot only; it may not include inspections performed since/);
 assert.match(body,/No two-month native PPE history is stored yet/);
});
test('legacy archive grid renders unreadable due history as question mark and includes pattern column',()=>{
 const from=src.indexOf('    function showCaptainDailyReport(');
 const to=src.indexOf('    function showCaptainDailySetPicker()',from);
 const body=src.slice(from,to);
 assert.match(body,/sourceUnreadable=item\.status!=='ok'&&due/);
 assert.match(body,/sourceUnreadable\?'\?':pendingTour\?'…':dutyUnverified\?'\?':due\?'✕'/);
 assert.match(body,/makeHead\('TWO-MONTH PATTERN'/);
 assert.match(body,/pattern\.repeated/);
 assert.match(body,/const missing=due&&!ok&&!sourceUnreadable&&!dutyUnverified&&tourFinished/);
 assert.match(body,/REPEATED MISSING CHECKS/);
});
