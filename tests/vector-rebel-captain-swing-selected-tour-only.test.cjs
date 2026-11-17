'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const part=(a,b)=>{
 const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'find '+a);
 return source.slice(i,j);
};
const tourPast={month:'2026-11',startDate:'2026-11-09',endDate:'2026-11-10',
 eligibleDates:['2026-11-09','2026-11-10'],due:true};
const tourOlder={month:'2026-11',startDate:'2026-11-03',endDate:'2026-11-04',
 eligibleDates:['2026-11-03','2026-11-04'],due:true};
const tourCurrent={month:'2026-11',startDate:'2026-11-15',endDate:'2026-11-16',
 eligibleDates:['2026-11-15','2026-11-16'],due:true};
const captain={prefix:'BRION',name:'Michael Brion'};
const swing={prefix:'CASHMAN',name:'Matthew Cashman'};
const baseRoster={
 startDate:'2026-11-15',endDate:'2026-11-16',
 basePrefixes:['BRION'],swingPrefixes:['CASHMAN'],
 onByDate:{
  '2026-11-15':['BRION','CASHMAN'],
  '2026-11-16':['BRION']
 }
};
const obs=(name,date,status)=>({
 name,date,status,sourceQuality:'good_direct_capture'
});
const oldWork=[obs(swing.name,'2026-11-03','work_evidence'),
 obs(swing.name,'2026-11-04','work_evidence'),
 obs(swing.name,'2026-11-09','work_evidence'),
 obs(swing.name,'2026-11-10','work_evidence')];
const helpers=new Function('captainHistoricalTourEnded','masterNameKey',
 'captainHistoricalOffFor','localTodayKey',
 part('    function captainScoutTourDuty(','    function captainDailyMissingTargets(')+
 '\nreturn {duty:captainOwnerTourDuty,isSwing:captainIsTemporarySwing};')(
 ()=>true,x=>String(x||'').toLowerCase().trim(),()=>null,()=>'2026-11-16'
);
const duty=(owner,tour,auditWindow,roster,records=oldWork)=>
 helpers.duty(owner,tour,auditWindow,roster,{},records);
const baseWindow={asOfDate:'2026-11-16',months:['2026-11'],
 tours:[tourOlder,tourPast,tourCurrent]};
test('historical Scout unit work does not generate red X for temporary other-shift crew',()=>{
 for(const tour of [tourOlder,tourPast]){
  const row=duty(swing,tour,baseWindow,baseRoster);
  assert.equal(row.due,false);
  assert.equal(row.off,false);
  assert.equal(row.notAssigned,true);
  assert.equal(row.unknown,false);
  assert.equal(row.assignmentSource,'swing_outside_selected_tour');
 }
 assert.equal(duty(captain,tourPast,baseWindow,baseRoster,[
  obs(captain.name,'2026-11-09','work_evidence')]).due,true,
  'original Captain Set member continues to be audited');
});
test('a swing selected only Day 1 owes just this tour, not old dates and not Day 2',()=>{
 const row=duty(swing,tourCurrent,baseWindow,baseRoster);
 assert.equal(row.due,true);
 assert.deepEqual(row.dutyDates,['2026-11-15']);
 assert.equal(row.assignmentSource,'swing_selected_tour');
});
test('swing assigned only on upcoming Day 2 remains not due until Day 2 starts',()=>{
 const roster={...baseRoster,onByDate:{
  '2026-11-15':['BRION'],'2026-11-16':['BRION','CASHMAN']
 }};
 const before=duty(swing,tourCurrent,{...baseWindow,asOfDate:'2026-11-15'},roster);
 assert.equal(before.due,false);
 assert.deepEqual(before.dutyDates,['2026-11-16']);
 const after=duty(swing,tourCurrent,{...baseWindow,asOfDate:'2026-11-17'},roster);
 assert.equal(after.due,true);
 assert.deepEqual(after.dutyDates,['2026-11-16']);
});
test('when temporarily unselected, swing incurs neither a red X nor OFF',()=>{
 const roster={...baseRoster,onByDate:{
  '2026-11-15':['BRION'],'2026-11-16':['BRION']
 }};
 const now=duty(swing,tourCurrent,baseWindow,roster);
 assert.equal(now.due,false);assert.equal(now.off,false);assert.equal(now.notAssigned,true);
});
test('Rebel Command attendance review ignores historical work/unknown for swings',()=>{
 const text=part('    function captainCommandAttendanceCandidates(',
                 '    async function captainReadCommandAttendance(');
 const fn=new Function('captainIsTemporarySwing','masterNameKey',
  'captainHistoricalTourEnded',text+
  '\nreturn captainCommandAttendanceCandidates;')(
  helpers.isSwing,x=>String(x||'').toLowerCase().trim(),()=>true);
 const report={tourRoster:baseRoster,auditWindow:baseWindow,owners:[
  {...captain,items:[{tourChecks:[{startDate:'2026-11-09',due:true,ok:false}]}]},
  {...swing,items:[{tourChecks:[{startDate:'2026-11-09',due:true,ok:false}]}]}
 ]};
 const records=[
  obs(captain.name,'2026-11-09','full_leave_evidence'),
  obs(captain.name,'2026-11-10','unknown'),
  obs(swing.name,'2026-11-09','full_leave_evidence'),
  obs(swing.name,'2026-11-10','unknown')
 ];
 const reviews=fn(report,records);
 assert.deepEqual(reviews.map(x=>x.owner.prefix),['BRION']);
});
test('existing saved report is rebuilt locally on open, not re-scanned',()=>{
 const render=part('    function showCaptainDailyReport(',
                   '    function showCaptainDailySetPicker(');
 assert.match(render,/if\(!report\.swingHistoryLimited/);
 assert.match(render,/captainRebuildStoredDailyReport\(report\)/);
 assert.match(render,/saveJSON\(CAPTAIN_DAILY_REPORT_KEY,report\)/);
 assert.match(render,/SWING '\+escapeHtml\(swingDates\.join/);
 assert.doesNotMatch(render,/startCaptainDailyCheck\(/,
  'migration does not launch a new native equipment scan');
});
test('read-only Scout query and evidence counts exclude temporary swing historical dates',()=>{
 const read=part('    async function captainReadCommandAttendance(',
                 '    async function captainShowCommandAttendance(');
 assert.match(read,/filter\(owner=>!captainIsTemporarySwing\(owner,report\.tourRoster\)\)/);
 const summary=part('    async function captainShowCommandAttendance(',
  '    function showCaptainDailyReport(');
 assert.match(summary,/if\(captainIsTemporarySwing\(owner,report\.tourRoster\)\)continue/);
 assert.match(summary,/temporary swings only counted on your selected tour/);
});
