'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.env.TZ='America/Chicago';
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    function apparatusWorkWindows(');
const b=src.indexOf('    function apparatusReportState() {',a);
assert.ok(a>=0&&b>a,'apparatus schedule/check evaluator exists');
const makeDate=t=>new Date(t);
const localKey=d=>{
 const dt=new Date(d);
 return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+
     String(dt.getDate()).padStart(2,'0');
};
const day=key=>Math.floor(Date.parse(key+'T00:00:00Z')/86400000);
const baseWindow=asOf=>({
 asOfDate:asOf,months:['2026-10','2026-11'],tours:[
  {month:'2026-11',startDate:'2026-11-09',endDate:'2026-11-10',due:true,
   eligibleDates:['2026-11-09','2026-11-10']},
  {month:'2026-11',startDate:'2026-11-14',endDate:'2026-11-15',due:true,
   eligibleDates:['2026-11-14','2026-11-15']},
  {month:'2026-11',startDate:'2026-11-08',endDate:'2026-11-09',due:true,
   eligibleDates:['2026-11-08','2026-11-09']}
 ]
});
const evaluate=new Function('captainAuditWindow','utcDayNumber','localTodayKey',
 'localHistoryDateKey','Date',src.slice(a,b)+
 '\nreturn {work:apparatusWorkWindows,shift:apparatusShiftDate,status:apparatusStatusForTour};')(
 baseWindow,day,localKey,localKey,Date);
const item=(name,scope,dates,other={})=>({
 name,scope,dates,readable:true,exhaustive:true,...other
});
test('C-shift Monday starts at 07:00; Station required only on that Monday',()=>{
 const before=evaluate.work('2026-11-09',makeDate('2026-11-09T06:59:00-06:00'));
 assert.equal(before.tours[0].due,false);
 assert.equal(before.tours[0].stationMonday,'2026-11-09');
 assert.equal(before.tours[0].stationDue,false);
 const after=evaluate.work('2026-11-09',makeDate('2026-11-09T07:01:00-06:00'));
 assert.equal(after.tours[0].due,true);
 assert.equal(after.tours[0].stationDue,true);
 assert.equal(after.tours[1].stationMonday,'');
 assert.equal(after.tours[1].stationDue,false);
 assert.equal(after.tours[2].stationMonday,'2026-11-09');
 assert.equal(after.tours[2].stationDue,true,'Monday second day also due');
});
test('A previously scanned report does not turn blank future cells red when reopened',()=>{
 const before=evaluate.work('2026-11-09',makeDate('2026-11-09T06:00:00-06:00'));
 const later=evaluate.work('2026-11-09',makeDate('2026-11-10T11:00:00-06:00'));
 assert.equal(before.tours[0].due,false);
 assert.equal(later.tours[0].due,true);
 assert.match(src,/apparatusWorkWindows\(report\.asOfDate,new Date\(report\.generatedAt\)\)/);
});
test('Truck and Medic require a completed native SCBA inspection for every current airpack',()=>{
 const w=evaluate.work('2026-11-09',makeDate('2026-11-09T18:00:00-06:00')).tours[0];
 const items=[
  item('AP-04','truck504',['2026-11-09']),
  item('AP-53','truck504',['2026-11-10']),
  item('AP-45','medic504',[]),
  item('AP-58','station4',['2026-11-09'])
 ];
 assert.equal(evaluate.status('truck504',w,items).code,'done');
 assert.equal(evaluate.status('medic504',w,items).code,'missing');
 assert.deepEqual(evaluate.status('medic504',w,items).missing,['AP-45']);
 assert.equal(evaluate.status('station4',w,items).code,'done');
});
test('Station SCBA Room on C-shift Monday must have completion on the Monday shift',()=>{
 const windows=evaluate.work('2026-11-09',makeDate('2026-11-09T10:00:00-06:00'));
 assert.equal(evaluate.status('station4',windows.tours[0],[
  item('AP-58','station4',['2026-11-10'])
 ]).code,'missing','Tuesday shift is not the Monday 24h shift');
 assert.equal(evaluate.status('station4',windows.tours[1],[
  item('AP-58','station4',[])
 ]).code,'na','no Monday in tour, no Station requirement');
});
test('Unreadable or nonexhaustive history is unknown, never a fabricated red X',()=>{
 const w=evaluate.work('2026-11-09',makeDate('2026-11-09T10:00:00-06:00')).tours[0];
 assert.equal(evaluate.status('truck504',w,[]).code,'unknown');
 assert.equal(evaluate.status('truck504',w,[
  item('AP-04','truck504',[],{exhaustive:false})
 ]).code,'unknown');
 assert.equal(evaluate.status('truck504',w,[
  item('AP-04','truck504',[],{readable:false,error:'No verified Item Log'})
 ]).code,'unknown');
 assert.equal(evaluate.status('truck504',w,[
  item('AP-04','truck504',['2026-11-09'],{exhaustive:false})
 ]).code,'done','a verified COMPLETED row counts despite older pages');
});
test('24-hour 07:00 boundary assigns post-midnight inspections to prior shift day',()=>{
 assert.equal(evaluate.shift(Date.parse('2026-11-10T03:30:00-06:00'),
  '11/10/2026 03:30 AM'),'2026-11-09');
 assert.equal(evaluate.shift(Date.parse('2026-11-10T07:10:00-06:00'),
  '11/10/2026 07:10 AM'),'2026-11-10');
});
test('Apparatus audit reads exact Standard pool and completed native SCBA logs only',()=>{
 const section=src.slice(src.indexOf('    // APPARATUS CHECK: read-only'),
  src.indexOf('    function showStation4ScbaAirpackCheck()',a));
 assert.match(section,/SCBA_FRAME_INSPECTION_TITLE/);
 assert.match(section,/rowLooksLikeCompletedModeEntry/);
 assert.match(section,/Standard/);
 assert.match(section,/299946/);
 assert.match(section,/historyRowAudit/);
 assert.match(section,/scbaAirpackReadInventory/);
 assert.match(section,/scbaAirpackEnsureNativeFilters/);
 assert.doesNotMatch(section,/\.submit\(|submitInspection\(|startButton\.click\(/);
});
test('Monthly Captain button and monthly criteria are removed from active Daily Captain audit',()=>{
 assert.doesNotMatch(src,/mainAction\("Captain's Monthly"/);
 assert.match(src,/mainAction\('Apparatus Check', showApparatusCheck, false\)/);
 const read=src.slice(src.indexOf('    async function readCaptainComplianceHistory(item) {'),
  src.indexOf('    function buildCaptainDailyReport(check) {'));
 assert.doesNotMatch(read,/getMode\('captain'\)/);
 const report=src.slice(src.indexOf('    function buildCaptainDailyReport(check) {'),
  src.indexOf('    function showCaptainDailySetPicker() {'));
 assert.doesNotMatch(report,/monthlyChecks|monthlyRequirementCount|capHead/);
 assert.match(report,/schemaVersion: 7/);
});
