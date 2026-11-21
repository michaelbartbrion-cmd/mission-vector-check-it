'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function slice(a,b){
 const start=source.indexOf(a),end=source.indexOf(b,start+1);
 assert.ok(start>=0&&end>start,'source includes '+a);
 return source.slice(start,end);
}
const progress=slice('    function captainDailyPause(',
 '    function captainDailyProgressPulse()');
function controls(){
 let stored={checkId:'test-cc1',status:'running',ownerTabId:'captain-tab',
  items:[{assetId:'GEAR1'},{assetId:'GEAR2'},{assetId:'GEAR3'}],
  index:1,results:[{assetId:'GEAR1',status:'ok'}],returnUrl:'https://vector.example/ppe'},
  confirmed=false,officerRun=false;
 const statuses=[],events=[];
 let renders=0,resumes=0;
 const f=new Function('getCaptainDailyCheck','saveCaptainDailyCheck',
 'clearCaptainDailyCheck','setStatus','captainDailyProgressPulse',
 'getRun','rebelCommandEvent','confirm','TAB_ID',
 'let captainDailyCancelSerial=0;\n'+progress+
 '\nreturn {pause:captainDailyPause,resume:captainDailyResume,'+
 'stop:captainDailyStop,serial:()=>captainDailyCancelSerial};')(
 ()=>stored,x=>stored=structuredClone(x),()=>{stored=null},
 (...args)=>statuses.push(args),()=>renders++,
 ()=>officerRun?{phase:'submitting'}:null,
 (...args)=>events.push(args),()=>confirmed,'captain-tab');
 // Resume after pending read is guarded in the existing scan state machine.
 const original=new Function('return null')();
 return{...f,get:()=>stored,statuses,events,render:()=>renders,
  approve:()=>confirmed=true,run:()=>officerRun=true};
}
test('pause keeps read-only receipts and blocks additional native navigation',()=>{
 const c=controls();
 assert.equal(c.pause(),true);
 assert.equal(c.get().status,'paused');
 assert.equal(c.get().resumeStatus,'running');
 assert.equal(c.get().results.length,1);
 assert.equal(c.get().index,1);
 assert.equal(c.pause(),false);
 assert.equal(c.events.length,0);
 assert.match(source,/if\(check.status==='paused'\)\{/);
 assert.match(source,/const pauseAfterCurrent=liveCheck.status==='paused'/);
 assert.match(source,/if\(pauseAfterCurrent\)\{/);
});
test('stop requires confirmation, cancels without marking a completed inspection',()=>{
 const c=controls();
 assert.equal(c.stop(),false);
 assert.equal(c.get().status,'running');
 c.approve();
 assert.equal(c.stop(),true);
 assert.equal(c.get(),null);
 assert.equal(c.serial(),1);
 assert.equal(c.events.length,1);
 assert.equal(c.events[0][0],'scan_check_stopped');
 assert.equal(c.events[0][1].metadata.readCount,1);
 assert.equal(c.events[0][1].metadata.itemCount,3);
 assert.equal(c.statuses.at(-1)[0].includes('No inspection was submitted'),true);
});
test('pause from final return preserves return path for a safe Resume',()=>{
 const c=controls();
 c.get().status='returning';
 assert.equal(c.pause(),true);
 assert.equal(c.get().resumeStatus,'returning');
 assert.equal(c.get().status,'paused');
});
const outcomeHelpers=slice('    function nativeItemLogRowOutcome(',
 '    async function readModeCompletionHistory(');
const helper=new Function('historyRowAudit','itemLogRowText',
 'parseVectorHistoryDate','localHistoryDateKey','clean',outcomeHelpers+
 '\nreturn {row:nativeItemLogRowOutcome,all:nativeCompletedVerdictsFromSource};')(
 row=>({cells:row.cells,parsedAt:Date.parse(row.cells[0])}),
 row=>row.cells.join(' '),raw=>Date.parse(raw),x=>new Date(x)
   .toISOString().slice(0,10),x=>String(x||'').trim()
);
test('completed inspections with explicit FAILED/PASSED answer result are distinct from completed unknown',()=>{
 const completed=(value)=>({cells:['2026-11-21T15:30:00Z','Tour PPE',
  'Completed',value]});
 assert.equal(helper.row(completed('FAILED')),'failed');
 assert.equal(helper.row(completed('PASSED')),'passed');
 assert.equal(helper.row(completed('Completed')),'unknown');
 assert.equal(helper.row(completed('Failure Details: no action')),'unknown',
  'unverified free text is not native failed-answer evidence');
 assert.equal(helper.row({cells:['2026-11-21T15:30:00Z','Result: FAILED']}),
  'failed');
 assert.equal(helper.row({cells:['2026-11-21T15:30:00Z','PASSED','FAILED']}),
  'unknown','conflicting result fields cannot assert PASS');
 const statuses=helper.all({rows:[
  completed('FAILED'),{cells:['2026-11-22T13:00:00Z','Tour PPE','Completed']},
  {cells:['2026-11-15T15:30:00Z','Tour PPE','PASSED']}
 ]});
 assert.equal(statuses['2026-11-21'],'failed');
 assert.equal(statuses['2026-11-22'],'unknown');
 assert.equal(statuses['2026-11-15'],'passed');
});
test('completed with FAILED answer counts COMPLETED, never PENDING nor PASS',()=>{
 const fnbody=slice('    function buildCaptainDailyReport(',
 '    function showCaptainHistoricalOffEditor(');
 const build=new Function('captainAuditWindow','getCaptainHistoricalOffTours',
 'captainOwnerTourDuty','localTodayKey',fnbody+
 '\nreturn buildCaptainDailyReport;')(
 ()=>({startDate:'2026-11-01',months:['2026-11'],tours:[
  {startDate:'2026-11-21',endDate:'2026-11-22',month:'2026-11',
   eligibleDates:['2026-11-21','2026-11-22']}]}),
 ()=>({schemaVersion:1,entries:{}}),
 ()=>({due:true,off:false,unknown:false,dutyDates:['2026-11-21']}),
 ()=> '2026-11-21');
 const prefix='PERSON-C';
 const assets=[
  {assetId:'COAT-PASS',dates:['2026-11-21'],verdicts:{'2026-11-21':'passed'}},
  {assetId:'PANTS-FAIL',dates:['2026-11-21'],verdicts:{'2026-11-21':'failed'}},
  {assetId:'HOOD-UNKNOWN',dates:['2026-11-21'],verdicts:{}},
  {assetId:'GLOVES-NO-CHECK',dates:[],verdicts:{}}
 ];
 const report=build({checkId:'test',auditAsOfDate:'2026-11-21',
  owners:[{name:'Captain',prefix}],
  items:assets.map(x=>({assetId:x.assetId,ownerPrefix:prefix,type:'PPE'})),
  results:assets.map(x=>({assetId:x.assetId,ownerPrefix:prefix,
   status:'ok',tour:{dates:x.dates,verdicts:x.verdicts}}))});
 const owner=report.owners[0],byId=id=>owner.items.find(x=>x.assetId===id);
 assert.equal(owner.tourCompletedCount,3);
 assert.equal(owner.tourPassedCount,1);
 assert.equal(owner.tourFailedCount,1);
 assert.equal(owner.tourResultUnknownCount,1);
 assert.equal(owner.tourRequirementCount,4);
 assert.equal(owner.compliant,false);
 assert.equal(byId('PANTS-FAIL').tourChecks[0].ok,true);
 assert.equal(byId('PANTS-FAIL').tourChecks[0].resultStatus,'failed');
 assert.equal(byId('HOOD-UNKNOWN').tourChecks[0].resultStatus,'unknown');
 assert.equal(byId('GLOVES-NO-CHECK').tourChecks[0].resultStatus,'not_completed');
 const complete=build({checkId:'test2',auditAsOfDate:'2026-11-21',
  owners:[{name:'Captain',prefix}],
  items:assets.slice(0,3).map(x=>({assetId:x.assetId,ownerPrefix:prefix,type:'PPE'})),
  results:assets.slice(0,3).map(x=>({assetId:x.assetId,ownerPrefix:prefix,
   status:'ok',tour:{dates:x.dates,verdicts:x.verdicts}}))});
 assert.equal(complete.owners[0].tourCheckOk,true,
  'all check dates are completed despite a failed answer');
 assert.equal(complete.owners[0].compliant,false,
  'the failed answer is separately reported, not a pass');
});
