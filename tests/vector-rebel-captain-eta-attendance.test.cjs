'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=src.indexOf('    function captainDailyTimeHistory() {');
const end=src.indexOf('    async function cancelCaptainDailyCheckForRealInspection()',start);
assert.ok(start>0&&end>start,'timing helpers found');
function harness(){
 const mem=new Map();
 const data=new Function('loadJSON','saveJSON','setInterval',
  'CAPTAIN_DAILY_TIMING_KEY','document','getCaptainDailyCheck','makeButton',
  src.slice(start,end)+
  '\nreturn {history:captainDailyTimeHistory,median:captainDailyMedian,'+
  'predict:captainDailyTimingPredict,remember:captainDailyRememberDuration,'+
  'eta:captainDailyEta,pulse:captainDailyProgressPulse,format:captainDailyFormatDuration};')(
  (k,f)=>mem.has(k)?structuredClone(mem.get(k)):f,
  (k,v)=>mem.set(k,structuredClone(v)),
  ()=>0,'timing',
  {getElementById:()=>null,body:null},()=>null,()=>{}
 );
 return {...data,mem};
}
test('no fabricated ETA before any actual completed item read',()=>{
 const h=harness(),items=[{inspectionModeKey:'tour'},{inspectionModeKey:'scbaTour'}];
 const prediction=h.predict(items);
 assert.equal(prediction.totalMs,null);
 assert.equal(prediction.knownCount,0);
 const q=h.eta({items,index:0,startedAt:new Date(100000).toISOString(),
  itemStartedAtMs:100000},112000);
 assert.equal(q.remainingMs,null);
 assert.equal(q.completedPercent,0);
});
test('learned median is robust to unusually slow Item Log outlier',()=>{
 const h=harness();
 for(const ms of [2000,3400,3800,520000,3600])h.remember({inspectionModeKey:'tour'},ms);
 assert.equal(h.history().samples,5);
 assert.equal(h.median(h.history().byMode.tour),3600);
 assert.equal(h.predict([{inspectionModeKey:'tour'},{inspectionModeKey:'tour'}]).totalMs,7200);
});
test('ETA carries over page navigation via persisted item start epoch',()=>{
 const h=harness();
 for(const ms of [8000,10000,12000])h.remember({inspectionModeKey:'tour'},ms);
 const now=100000;
 const check={items:[{inspectionModeKey:'tour'},{inspectionModeKey:'tour'},
 {inspectionModeKey:'tour'}],index:1,
 startedAt:new Date(20000).toISOString(),itemStartedAtMs:97000};
 const q=h.eta(check,now);
 assert.equal(q.completedPercent,33);
 assert.equal(q.remainingMs,17000);
 assert.equal(q.elapsedMs,80000);
 assert.equal(h.format(q.remainingMs),'0:17');
});
test('completed duration samples omit failures, zero, negative and runaway navigation',()=>{
 const h=harness();
 assert.equal(h.remember({},0),false);
 assert.equal(h.remember({},-1000),false);
 assert.equal(h.remember({},20*60*1000),false);
 assert.equal(h.remember({},9000),true);
 assert.equal(h.history().samples,1);
});
test('mode-specific SCBA and ordinary PPE histories predict different item durations',()=>{
 const h=harness();
 h.remember({inspectionModeKey:'tour'},4000);
 h.remember({inspectionModeKey:'scbaTour'},12000);
 assert.deepEqual(h.predict([{inspectionModeKey:'tour'},{inspectionModeKey:'scbaTour'}]).estimates,[4000,12000]);
});
test('last-name swing sorting uses surname prefix with first-name tie break',()=>{
 assert.match(src,/captainSurname\(a\.name\)\.localeCompare\(captainSurname\(b\.name\)\)/);
 const options=[
  {name:'Zoe Weems'}, {name:'Adam Baldree'}, {name:'Michael Brion'}, {name:'Bob Bowland'}
 ];
 const surname=x=>String(x.name).split(' ').at(-1);
 options.sort((a,b)=>surname(a).localeCompare(surname(b))||a.name.localeCompare(b.name));
 assert.deepEqual(options.map(x=>x.name),['Adam Baldree','Bob Bowland','Michael Brion','Zoe Weems']);
});
const a=src.indexOf('    function captainCommandAttendanceCandidates(');
const b=src.indexOf('    function showCaptainDailyReport(',a);
assert.ok(a>0&&b>a,'Rebel Command candidate read helper');
const candidates=new Function('captainHistoricalTourEnded','masterNameKey',
 src.slice(a,b)+'\nreturn captainCommandAttendanceCandidates;')(
 ()=>true,x=>String(x||'').toLowerCase().trim());
const report={owners:[{name:'Jerry Weems',prefix:'WEEMS',
 items:[{tourChecks:[{startDate:'2026-11-09',due:true,ok:false}]}]}],
 auditWindow:{tours:[{startDate:'2026-11-09',endDate:'2026-11-10'}]}};
const result=(s1,s2)=>[
 {name:'Jerry Weems',date:'2026-11-09',status:s1,sourceQuality:'good_direct_capture'},
 {name:'Jerry Weems',date:'2026-11-10',status:s2,sourceQuality:'good_direct_capture'}];
test('two full-day leave records are handled as source OFF, not a spurious review exception',()=>{
 const yes=candidates(report,result('full_leave_evidence','full_leave_evidence'));
 assert.equal(yes.length,0);
 const maybe=candidates(report,result('full_leave_evidence','unknown'));
 assert.equal(maybe.length,1);assert.equal(maybe[0].confidence,'incomplete');
 assert.equal(candidates(report,result('work_evidence','unknown')).length,0);
 assert.equal(candidates(report,result('unknown','unknown')).length,0);
});
test('verified full-day other-unit assignments are WORKING, never an excuse to dismiss PPE',()=>{
 const other=result('work_evidence','work_evidence');
 const items=candidates(report,other);
 assert.equal(items.length,0);
 assert.equal(candidates(report,result('full_leave_evidence','work_evidence')).length,0);
 assert.equal(candidates(report,result('deployment_evidence','work_evidence')).length,0);
});
test('Command attendance is suggest-only, preserves manual attestation for any red X',()=>{
 const t=src.slice(a,b);
 assert.match(t,/captainReadCommandAttendance/);
 assert.match(t,/captainShowCommandAttendance/);
 assert.match(t,/showCaptainHistoricalOffEditor/);
 assert.doesNotMatch(t,/captainRecordHistoricalOff\(/,
  'No automatic OFF compliance changes based on a scheduled leave row');
});
