'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function block(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'source function boundaries: '+start);
 return source.slice(a,b);
}
const helpers=block('    function captainScoutTourDuty(', '    function buildCaptainDailyReport(');
const funcs=new Function('localTodayKey','validDateKey','captainHistoricalOffFor',
 'captainHistoricalTourEnded','masterNameKey',helpers+
  '\nreturn {captainOwnerTourDuty,captainDailyMissingTargets,captainDailySourceResults};')(
  ()=> '2026-11-15',
  value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'',()=>null,
  ()=>true,x=>String(x||'').toLowerCase().trim()
);
const roster={
 startDate:'2026-11-15',endDate:'2026-11-16',
 basePrefixes:['PERSON-BRION','PERSON-BALDREE'],
 swingPrefixes:['PERSON-POWELL'],
 onByDate:{
  '2026-11-15':['PERSON-BALDREE','PERSON-POWELL'],
  '2026-11-16':['PERSON-BALDREE','PERSON-BRION']
 }
};
const past={month:'2026-11',startDate:'2026-11-09',endDate:'2026-11-10',
 eligibleDates:['2026-11-09','2026-11-10'],due:true};
const current={month:'2026-11',startDate:'2026-11-15',endDate:'2026-11-16',
 eligibleDates:['2026-11-15'],due:true};
const window={asOfDate:'2026-11-15',months:['2026-10','2026-11'],
 tours:[past,current]};
test('base member off Day 1, here Day 2: previous tours still due, upcoming day not falsely due',()=>{
 const b={prefix:'PERSON-BRION'};
 const pastDuty=funcs.captainOwnerTourDuty(b,past,window,roster);
 assert.equal(pastDuty.due,true);
 assert.equal(pastDuty.off,false);
 assert.equal(pastDuty.notAssigned,false);
 const shift=funcs.captainOwnerTourDuty(b,current,window,roster);
 assert.equal(shift.due,false);
 assert.equal(shift.off,false);
 assert.deepEqual(shift.dutyDates,['2026-11-16']);
});
test('swing added Day 1 only is due current tour and not historical tours',()=>{
 const s={prefix:'PERSON-POWELL'};
 assert.equal(funcs.captainOwnerTourDuty(s,past,window,roster).off,false);
 assert.equal(funcs.captainOwnerTourDuty(s,past,window,roster).notAssigned,true);
 assert.equal(funcs.captainOwnerTourDuty(s,past,window,roster).due,false);
 const active=funcs.captainOwnerTourDuty(s,current,window,roster);
 assert.equal(active.due,true);
 assert.deepEqual(active.dutyDates,['2026-11-15']);
});
test('person OFF both days stays in history but has no current tour due',()=>{
 const other={...roster,onByDate:{
  '2026-11-15':['PERSON-POWELL'],'2026-11-16':['PERSON-POWELL']
 }};
 const brion=funcs.captainOwnerTourDuty({prefix:'PERSON-BRION'},current,window,other);
 assert.equal(brion.off,true);assert.equal(brion.due,false);
 assert.equal(funcs.captainOwnerTourDuty({prefix:'PERSON-BRION'},past,window,other).due,true);
});
const report={
 schemaVersion:8,
 owners:[{
  name:'Michael Brion',prefix:'PERSON-BRION',
  items:[
   {assetId:'B-11',type:'Coat',status:'ok',tourDates:['2026-11-09'],
    tourChecks:[{due:true,ok:true},{due:false,ok:false}]},
   {assetId:'B-12',type:'Pants',status:'ok',tourDates:['2026-11-09'],
    tourChecks:[{due:true,ok:false},{due:false,ok:false}]},
   {assetId:'B-13',type:'Boots',status:'error',tourDates:[],
    tourChecks:[{due:true,ok:false},{due:false,ok:false}]},
   {assetId:'B-14',type:'Helmet',status:'ok',tourDates:[],
    tourChecks:[{due:false,ok:false,off:true}]}
  ]
 }]
};
test('Recheck Missing selects only two missing/due items, never green verified or OFF/future',()=>{
 const targets=funcs.captainDailyMissingTargets(report);
 assert.deepEqual(targets.map(x=>x.assetId),['B-12','B-13']);
 const old=funcs.captainDailySourceResults(report);
 assert.equal(old.length,4);
 assert.deepEqual(old[0].tour.dates,['2026-11-09']);
});
test('report reflects two-month tour results with day-specific due and explicit OFF',()=>{
 const src=block('    function buildCaptainDailyReport(', '    function showCaptainDailyReport(');
 const make=new Function('captainAuditWindow','captainOwnerTourDuty','localTodayKey','getCaptainHistoricalOffTours',src+
 '\nreturn buildCaptainDailyReport;')(()=>window,funcs.captainOwnerTourDuty,()=> '2026-11-15',()=>({schemaVersion:1,entries:{}}));
 const check={
  checkId:'c1',setId:'captain',setName:'Station 4',auditAsOfDate:'2026-11-15',
  tourRoster:roster,
  owners:[
   {name:'Michael Brion',prefix:'PERSON-BRION'},
   {name:'Nicholas Powell',prefix:'PERSON-POWELL'}
  ],
  items:[
   {assetId:'B-11',type:'Coat',ownerPrefix:'PERSON-BRION',url:'https://x/B-11'},
   {assetId:'P-11',type:'Helmet',ownerPrefix:'PERSON-POWELL',url:'https://x/P-11'}
  ],
  results:[
   {assetId:'B-11',ownerPrefix:'PERSON-BRION',status:'ok',tour:{dates:['2026-11-09']}},
   {assetId:'P-11',ownerPrefix:'PERSON-POWELL',status:'ok',tour:{dates:[]}}
  ]
 };
 const res=make(check);
 assert.equal(res.schemaVersion,8);
 assert.equal(res.owners[0].items[0].tourChecks[0].due,true);
 assert.equal(res.owners[0].items[0].tourChecks[1].due,false);
 assert.equal(res.owners[1].items[0].tourChecks[0].off,false);
 assert.equal(res.owners[1].items[0].tourChecks[0].notAssigned,true);
 assert.equal(res.owners[1].items[0].tourChecks[1].due,true);
 assert.equal(res.owners[1].tourRequirementCount,1);
 assert.equal(res.owners[0].tourRequirementCount,1);
 assert.deepEqual(res.sourceSnapshot.items,check.items);
 assert.deepEqual(res.sourceSnapshot.results,check.results);
});
test('picker has day-specific OFF/Here controls, Add Swing, and no permanent Captain Set write',()=>{
 const body=block('    function showCaptainDailySetPicker() {','    // Recheck only previously due');
 assert.match(body,/WHO IS HERE THIS TOUR/);
 assert.match(body,/Select swing from master list/);
 assert.match(body,/\+ Add Swing/);
 assert.match(body,/getCaptainPersonOptions\(\)/);
 assert.match(body,/entry\.day1/);
 assert.match(body,/entry\.day2/);
 assert.match(body,/basePrefixes:set\.people\.map/);
 assert.match(body,/await startCaptainDailyCheck\(selectedSet,\s*auditAsOfDate\)/);
 assert.doesNotMatch(body,/saveConfig\(/,'no permanent Captain Set modifications');
});
test('results show OFF and offer Recheck Missing based on due missing assets only',()=>{
 const body=block('    function showCaptainDailyReport(', '    function showCaptainDailySetPicker()');
 assert.match(body,/mark\.textContent=ok\?'✓':off\?/);
 assert.match(body,/Recheck Missing \('/);
 assert.match(body,/await startCaptainDailyMissingRecheck\(report\)/);
 assert.match(body,/const due = tour\.due === true/);
});
