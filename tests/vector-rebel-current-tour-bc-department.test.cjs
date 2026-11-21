'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const part=(from,to)=>{
 const a=src.indexOf(from),b=src.indexOf(to,a+from.length);
 assert.ok(a>=0&&b>a,'missing feature '+from);
 return src.slice(a,b);
};
const normalize=x=>String(x||'').trim().toLowerCase();
const proj=part('    function captainProjectConfirmedTour(',
    '    function showCaptainDailySetPicker()');
function projected(old,set){
 let received=null;
 const build=check=>{
  received=check;
  return{schemaVersion:8,reportId:check.checkId,
   generatedAt:check.displayGeneratedAt,
   sourceSnapshot:{auditAsOfDate:check.auditAsOfDate},
   owners:check.owners};
 };
 const f=new Function('buildCaptainDailyReport','captainDailySourceResults',
  proj+'\nreturn captainProjectConfirmedTour;')(build,()=>[]);
 const report=f(old,set,'2026-11-21');
 return{report,received};
}
test('confirm current tour drops previous overtime guest while retaining true native PPE proof',()=>{
 const previous={schemaVersion:8,reportId:'old-audit',generatedAt:'2026-11-15T16:00:00Z',
  sourceSnapshot:{
   owners:[{name:'Michael Brion',prefix:'BRION'},{name:'Prior OT',prefix:'OLDOT'}],
   items:[{ownerPrefix:'BRION',assetId:'COAT',type:'Bunker Coat'},
          {ownerPrefix:'OLDOT',assetId:'OTCOAT',type:'Bunker Coat'}],
   results:[{ownerPrefix:'BRION',assetId:'COAT',status:'ok',
       tour:{dates:['2026-11-15']}},{ownerPrefix:'OLDOT',assetId:'OTCOAT',status:'ok'}],
   discovery:[],attendanceRecords:null
  }};
 const selected={id:'c',name:'C shift',shift:'C',
  people:[{name:'Michael Brion',prefix:'BRION'},{name:'Current OT',prefix:'NEWOT'}],
  rosterConfirmedAt:'2026-11-21T15:00:00Z',
  tourRoster:{startDate:'2026-11-21',endDate:'2026-11-22',
    basePrefixes:['BRION'],swingPrefixes:['NEWOT'],
    onByDate:{'2026-11-21':['BRION','NEWOT'],'2026-11-22':['BRION']}}
 };
 const {report,received}=projected(previous,selected);
 assert.deepEqual(received.owners.map(x=>x.name),['Michael Brion','Current OT']);
 assert.deepEqual(received.items.map(x=>x.assetId),['COAT']);
 assert.deepEqual(received.results.map(x=>x.assetId),['COAT']);
 assert.equal(report.sourceNativeReadAt,'2026-11-15T16:00:00Z');
 assert.equal(report.currentTourCrewConfirmedAt,'2026-11-21T15:00:00Z');
 assert.equal(report.usesSavedItemLogSnapshot,true);
 assert.equal(report.generatedAt,'2026-11-15T16:00:00Z');
 assert.equal(received.discovery.find(x=>x.prefix==='NEWOT').error,
   'New crew member needs a fresh native Item Log audit');
});
test('when no real saved native source exists, confirmation must start a real read instead of faking a report',()=>{
 const f=new Function('buildCaptainDailyReport','captainDailySourceResults',
  proj+'\nreturn captainProjectConfirmedTour;')(()=>{throw Error('faked')},()=>[]);
 assert.equal(f(null,{people:[]},'2026-11-21'),null);
 assert.equal(f({schemaVersion:8,sourceSnapshot:{items:[]}},
  {people:[]},'2026-11-21'),null);
});
const pulse=part('    function captainCurrentTourPulse(',
  '    function showCaptainDailyReport(');
const current=new Function('localTodayKey',pulse+'\nreturn captainCurrentTourPulse;')(
 ()=> '2026-11-21');
test('current shift clearly reports verified native checks, pending and unmapped gear',()=>{
 const report={generatedAt:'2026-11-15T16:00:00Z',
  sourceNativeReadAt:'2026-11-15T16:00:00Z',
  tourRoster:{startDate:'2026-11-21',endDate:'2026-11-22',
    basePrefixes:['A','B','WEEMS'],
    onByDate:{'2026-11-21':['A'],'2026-11-22':['A','B']}},
  owners:[{name:'A',prefix:'A',items:[
   {inspectionModeKey:'tour',status:'ok',
     tourChecks:[{startDate:'2026-11-21',ok:true,date:'2026-11-21'}]},
   {inspectionModeKey:'tour',status:'ok',
     tourChecks:[{startDate:'2026-11-21',ok:false}]},
   {inspectionModeKey:'scbaTour',status:'ok',
     tourChecks:[{startDate:'2026-11-21',ok:false}]}
  ]},{name:'B',prefix:'B',items:[]},
   {name:'Jerry Weems',prefix:'WEEMS',items:[
    {inspectionModeKey:'tour',status:'ok',
     tourChecks:[{startDate:'2026-11-21',due:false,ok:false}]}
   ]}]};
 const v=current(report,'2026-11-21');
 assert.equal(v.workingToday,1);
 assert.equal(v.verified,1);
 assert.equal(v.pending,2);
 assert.equal(v.unknownMapping,19);
 assert.equal(v.offBoth,1);
 assert.equal(v.people.find(x=>x.name==='Jerry Weems').offBoth,true);
 assert.equal(v.people.find(x=>x.name==='Jerry Weems').pending,0);
 assert.equal(v.itemsPending.length,2);
 assert.ok(v.itemsPending.every(x=>x.kind==='not_recorded'));
 assert.equal(v.people.find(x=>x.name==='A').day2,true);
 assert.equal(v.people.find(x=>x.name==='B').day1,false);
 assert.equal(current(report,'2026-11-27'),null);
});
const bc=part('    const BC_DAILY_ROSTER_KEY=',
  '    function showBcDepartmentCheck(){');
const C=new Set(['michael brion','jared weston','jerry weems']);
const f=new Function('clean','masterNameKey','C_PILOT_NAMES',
 'getCaptainPersonOptions','addDateKeyDays',bc+
 '\nreturn {bcDepartmentDailyRows,bcCShiftHistoryCell};')(
 x=>String(x||'').trim(),normalize,C,
 ()=>[{name:'Current OT',prefix:'NEWOT'},
     {name:'Michael Brion',prefix:'BRION'},
     {name:'Austin Fox',prefix:'FOX'}],
 (day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000)
  .toISOString().slice(0,10)
);
test('BC includes every scheduled apparatus citywide and current confirmed C, excludes off C and old OT',()=>{
 const date='2026-11-21';
 const schedule={people:[
  {name:'Michael Brion',prefix:'BRION',units:['Truck 504'],sourceStatus:'scheduled_work_evidence'},
  {name:'Austin Fox',prefix:'FOX',units:['Truck 501'],sourceStatus:'scheduled_work_evidence'},
  {name:'Steven Beagle',units:['Battalion 501'],sourceStatus:'scheduled_work_evidence'},
  {name:'Jerry Weems',units:['Engine 505'],sourceStatus:'scheduled_work_evidence'}
 ]};
 const pilot={activeTour:true,tourStart:date,tourEnd:'2026-11-22',
  people:[{name:'Michael Brion',prefix:'BRION',dutyDay1:'working',
   lastDutyConfirmedAt:'2026-11-21T14:00:00Z'},
   {name:'Jerry Weems',prefix:'WEEMS',dutyDay1:'off',
   lastDutyConfirmedAt:'2026-11-21T14:00:00Z'}]};
 const report={currentTourCrewConfirmedAt:'2026-11-21T15:00:00Z',
  tourRoster:{startDate:date,endDate:'2026-11-22',
   basePrefixes:['BRION'],swingPrefixes:['NEWOT'],
   onByDate:{'2026-11-21':['BRION'],'2026-11-22':['BRION']}},
  owners:[{name:'Michael Brion',prefix:'BRION',items:[]},
   {name:'Prior OT',prefix:'OLDOT',items:[]}]};
 const rows=f.bcDepartmentDailyRows(schedule,pilot,report,date);
 assert.ok(rows.some(x=>x.name==='Austin Fox'));
 assert.ok(rows.some(x=>x.name==='Steven Beagle'));
 assert.ok(rows.find(x=>x.name==='Michael Brion').confirmed);
 assert.ok(rows.find(x=>x.name==='Michael Brion').cShifter);
 assert.equal(rows.some(x=>x.name==='Jerry Weems'),false);
 assert.equal(rows.some(x=>x.name==='Prior OT'),false);
 assert.ok(rows.every(x=>x.source!=='bc_confirmed'));
});
test('BC explicit same-date confirmed rollcall overrides stale schedule without touching CrewSense',()=>{
 const date='2026-11-21',schedule={people:[
  {name:'Austin Fox',prefix:'FOX',units:['Truck 501'],sourceStatus:'scheduled_work_evidence'},
  {name:'Michael Brion',prefix:'BRION',units:['Truck 504'],sourceStatus:'scheduled_work_evidence'}]};
 const manual={date,confirmedAt:'2026-11-21T15:00:00Z',
  people:[{name:'Michael Brion'},{name:'Current OT'}]};
 const rows=f.bcDepartmentDailyRows(schedule,null,null,date,manual);
 assert.deepEqual(rows.map(x=>x.name),['Michael Brion','Current OT']);
 assert.ok(rows.every(x=>x.confirmed===true));
 assert.equal(f.bcDepartmentDailyRows(schedule,null,null,'2026-11-22',manual).length,2,
  'Nov 21 rollcall does not erase tomorrow\'s schedule');
});
test('short C tour history counts only actual native checks; uncollected sources are unknown',()=>{
 const report={owners:[{name:'Michael Brion',items:[
  {status:'ok',tourChecks:[{startDate:'2026-11-15',ok:true}]},
  {status:'ok',tourChecks:[{startDate:'2026-11-15',ok:false}]},
  {status:'error',tourChecks:[{startDate:'2026-11-15',ok:false}]}
 ]}]};
 assert.deepEqual(f.bcCShiftHistoryCell(report,'Michael Brion','2026-11-15'),
  {label:'1 / 3',detail:'1 native checks confirmed of 3 known items. Remaining are unverified, not proven missed.'});
 assert.equal(f.bcCShiftHistoryCell(report,'Michael Brion','2026-11-21').label,'?');
 assert.equal(f.bcCShiftHistoryCell(report,'Unknown C member','2026-11-15').label,'?');
 const nativeBoard={people:[{name:'Jared Weston',gear:[
  {assetId:'A',status:'verified',nativeCompletionDate:'2026-11-15'},
  {assetId:'B',status:'not_yet_verified'},
  {assetId:'C',status:'verified',nativeCompletionDate:'2026-11-12'}
 ],maskGear:[{assetId:'MASK',status:'verified',
  nativeCompletionDate:'2026-11-16'}]}]};
 const result=f.bcCShiftHistoryCell(report,'Jared Weston',
  '2026-11-15',nativeBoard);
 assert.equal(result.label,'2 / 4');
 assert.match(result.detail,/native-dated Item Log receipts/);
});
