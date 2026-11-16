'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const slice=(a,b)=>{
 const start=src.indexOf(a),end=src.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'find source '+a);
 return src.slice(start,end);
};
const tour={startDate:'2026-10-10',endDate:'2026-10-11',month:'2026-10',
 due:true,eligibleDates:['2026-10-10','2026-10-11']};
const todayTour={startDate:'2026-11-15',endDate:'2026-11-16',month:'2026-11',
 due:true,eligibleDates:['2026-11-15']};
const window={asOfDate:'2026-11-16',months:['2026-10','2026-11'],
 tours:[tour,todayTour]};
const bob={name:'Robert Brooks',prefix:'BROOKS'};
const swing={name:'Matthew Cashman',prefix:'CASHMAN'};
const roster={startDate:'2026-11-15',endDate:'2026-11-16',
 basePrefixes:['BROOKS'],swingPrefixes:['CASHMAN'],
 onByDate:{
  '2026-11-15':['BROOKS','CASHMAN'],
  '2026-11-16':['BROOKS','CASHMAN']}};
const record=(name,date,status,quality='good_direct_capture')=>({
 name,date,status,sourceQuality:quality
});
function setup(manual={}){
 const dateKey=x=>String(x||'');
 const key=x=>String(x||'').toLowerCase().trim();
 const body=slice('    function captainScoutTourDuty(',
                  '    function captainDailyMissingTargets(');
 const fn=new Function('captainHistoricalTourEnded','masterNameKey',
  'captainHistoricalOffFor','localTodayKey',body+
  '\nreturn {scout:captainScoutTourDuty,duty:captainOwnerTourDuty};')(
  ()=>true,key,(o,t)=>manual[o.prefix+'|'+t.startDate]||null,
  ()=>'2026-11-16');
 const helpers=new Function(slice('    function captainDailyMissingTargets(',
  '    function buildCaptainDailyReport(')+
  '\nreturn {missing:captainDailyMissingTargets};')();
 const build=new Function('captainAuditWindow','getCaptainHistoricalOffTours',
  'captainOwnerTourDuty','localTodayKey',
  slice('    function buildCaptainDailyReport(',
       '    function showCaptainHistoricalOffEditor(')+
  '\nreturn buildCaptainDailyReport;')(
   ()=>window,()=>({schemaVersion:1,entries:manual}),fn.duty,
   ()=>'2026-11-16');
 return {...fn,...helpers,build};
}
const absences=name=>[
 record(name,'2026-10-10','full_leave_evidence'),
 record(name,'2026-10-11','deployment_evidence')
];
const work=name=>[
 record(name,'2026-10-10','work_evidence'),
 record(name,'2026-10-11','full_leave_evidence')
];
const unknown=name=>[
 record(name,'2026-10-10','full_leave_evidence'),
 record(name,'2026-10-11','unknown')
];
function checkResult(records){
 const h=setup();
 const owners=[bob,swing];
 const items=[
  {assetId:'BROOKS-C',ownerPrefix:'BROOKS',type:'Coat'},
  {assetId:'CASHMAN-C',ownerPrefix:'CASHMAN',type:'Coat'},
  {assetId:'CASHMAN-P',ownerPrefix:'CASHMAN',type:'Pants'}
 ];
 const results=[
  {assetId:'BROOKS-C',ownerPrefix:'BROOKS',status:'ok',tour:{dates:[]}},
  {assetId:'CASHMAN-C',ownerPrefix:'CASHMAN',status:'ok',tour:{dates:[]}},
  {assetId:'CASHMAN-P',ownerPrefix:'CASHMAN',status:'ok',
   tour:{dates:['2026-10-10']}}
 ];
 return {h,report:h.build({
  checkId:'r1',setId:'Captain',setName:'Captain',
  auditAsOfDate:'2026-11-16',owners,items,results,discovery:[],
  tourRoster:roster,attendanceRecords:records
 })};
}
test('an assigned unit on either day makes the entire tour PPE due, even another station',()=>{
 const h=setup();
 const result=h.duty(bob,tour,window,roster,{},work(bob.name));
 assert.equal(result.due,true);assert.equal(result.off,false);
 assert.equal(result.assignmentSource,'scout_any_unit');
 assert.deepEqual(result.dutyDates,['2026-10-10']);
});
test('temporary swing with another shift working old dates is blank in my Captain report',()=>{
 const h=setup();
 const result=h.duty(swing,tour,window,roster,{},work(swing.name));
 assert.equal(result.due,false);
 assert.equal(result.off,false);
 assert.equal(result.unknown,false);
 assert.equal(result.notAssigned,true);
 assert.equal(result.assignmentSource,'swing_outside_selected_tour');
 // Only the selected current tour makes this temporary swing responsible.
 const selected=h.duty(swing,todayTour,window,roster,{},work(swing.name));
 assert.equal(selected.due,true);
 assert.deepEqual(selected.dutyDates,['2026-11-15','2026-11-16']);
});
test('full verified off + full verified deployed on two shifts exempts PPE for that tour',()=>{
 const h=setup();
 const result=h.duty(bob,tour,window,roster,{},absences(bob.name));
 assert.equal(result.off,true);
 assert.equal(result.due,false);
 assert.equal(result.offSource,'scout_verified_absence');
});
test('one OFF day and an unknown day cannot silently exempt a tour',()=>{
 const h=setup();
 const result=h.duty(bob,tour,window,roster,{},unknown(bob.name));
 assert.equal(result.off,false);assert.equal(result.due,false);
 assert.equal(result.unknown,true);
});
test('an unverified assignment on another unit cannot create a false red X',()=>{
 const h=setup();
 const rec=[record(bob.name,'2026-10-10','work_evidence','unverified')];
 const result=h.duty(bob,tour,window,roster,{},rec);
 assert.equal(result.unknown,true);assert.equal(result.due,false);
});
test('actual worked-unit evidence overrides stale manual OFF or different shift exception',()=>{
 const manual={
  'BROOKS|2026-10-10':{
   reason:'Vacation',source:'captain_manual',
   startDate:'2026-10-10',endDate:'2026-10-11',prefix:'BROOKS'
  }
 };
 const h=setup(manual);
 const result=h.duty(bob,tour,window,roster,{},work(bob.name));
 assert.equal(result.due,true);assert.equal(result.attendanceConflict,true);
});
test('old Different shift / other captain note no longer creates exemption',()=>{
 const manual={
  'BROOKS|2026-10-10':{
   reason:'Different shift / other captain',
   source:'captain_manual',startDate:'2026-10-10',
   endDate:'2026-10-11',prefix:'BROOKS'
  }
 };
 const h=setup(manual);
 assert.equal(h.duty(bob,tour,window,roster,{},null).due,true);
});
test('swing past uninspected tours are blank and verified past native checks stay green',()=>{
 const {h,report}=checkResult([...work(bob.name),...work(swing.name)]);
 const swingRow=report.owners.find(o=>o.prefix==='CASHMAN');
 const pants=swingRow.items.find(x=>x.assetId==='CASHMAN-P');
 const coat=swingRow.items.find(x=>x.assetId==='CASHMAN-C');
 assert.equal(coat.tourChecks[0].due,false);
 assert.equal(coat.tourChecks[0].ok,false);
 assert.equal(coat.tourChecks[0].unknown,false);
 assert.equal(coat.tourChecks[0].off,false);
 assert.equal(coat.tourChecks[0].notAssigned,true);
 assert.equal(pants.tourChecks[0].due,false);
 assert.equal(pants.tourChecks[0].ok,true);
 assert.equal(pants.tourChecks[0].date,'2026-10-10');
 assert.equal(coat.tourChecks[1].due,true);
 assert.ok(!h.missing(report).some(x=>x.assetId==='CASHMAN-C'&&
   !coat.tourChecks[1].due),'past swing tour is never missing');
 assert.equal(report.swingHistoryLimited,true);
});
test('permanent crew with two-day leave is OFF, temporary swing other tour stays blank',()=>{
 const {report}=checkResult([...absences(bob.name),...absences(swing.name)]);
 const base=report.owners[0].items[0].tourChecks[0];
 assert.equal(base.off,true);assert.equal(base.due,false);
 const swingChecks=report.owners[1].items.map(item=>item.tourChecks[0]);
 assert.equal(swingChecks.every(x=>!x.off&&!x.due&&!x.unknown),true);
 assert.equal(report.owners[1].items[1].tourDates[0],'2026-10-10');
});
test('uncertain permanent historical attendance remains ?, temporary swing past stays blank',()=>{
 const {report}=checkResult([...unknown(bob.name),...unknown(swing.name)]);
 const base=report.owners[0].items[0].tourChecks[0];
 assert.equal(base.unknown,true);assert.equal(base.off,false);assert.equal(base.due,false);
 const swingChecks=report.owners[1].items.map(i=>i.tourChecks[0]);
 assert.equal(swingChecks.every(x=>!x.unknown&&!x.off&&!x.due),true);
});
test('renderer shows explicit uncertainty and manual review but never submits native inspections',()=>{
 const ui=slice('    async function captainShowCommandAttendance(',
                '    function showCaptainDailySetPicker(');
 assert.match(ui,/worked tours \(PPE required\)/);
 assert.match(ui,/fully off\/deployed tours \(no PPE required\)/);
 assert.match(ui,/unknown\?'\?'/);
 assert.match(ui,/captainRebuildStoredDailyReport\(report,result\.records\)/);
 assert.match(ui,/saveJSON\(CAPTAIN_DAILY_REPORT_KEY,updated\)/);
 assert.doesNotMatch(ui,/submitInspection\(/);
});
