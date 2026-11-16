'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function part(start,end){
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'source function found '+start);
 return source.slice(i,j);
}
const audit={
 asOfDate:'2026-11-15',months:['2026-10','2026-11'],
 tours:[
  {month:'2026-11',startDate:'2026-11-09',endDate:'2026-11-10',
   eligibleDates:['2026-11-09','2026-11-10'],due:true},
  {month:'2026-11',startDate:'2026-11-15',endDate:'2026-11-16',
   eligibleDates:['2026-11-15'],due:true}
 ]};
const roster={
 startDate:'2026-11-15',endDate:'2026-11-16',
 basePrefixes:['PERSON-BRION'],
 swingPrefixes:['PERSON-WEEMS'],
 onByDate:{
  '2026-11-15':['PERSON-BRION','PERSON-WEEMS'],
  '2026-11-16':['PERSON-BRION','PERSON-WEEMS']
 }
};
const brion={name:'Michael Brion',prefix:'PERSON-BRION'};
const weems={name:'Jerry Weems',prefix:'PERSON-WEEMS'};
const other={name:'Baldree Guest',prefix:'PERSON-GUEST'};
function harness(ledger=null){
 const manual=ledger||{schemaVersion:1,entries:{}};
 const ownerFunc=new Function('captainHistoricalOffFor','localTodayKey',
  part('    function captainOwnerTourDuty(',
       '    function captainDailyMissingTargets(')+
  '\nreturn captainOwnerTourDuty;')(
   (owner,tour)=>(manual.entries||{})[owner.prefix.toUpperCase()+'|'+tour.startDate]||null,
   ()=>'2026-11-15');
 const helpers=new Function(part('    function captainDailyMissingTargets(',
   '    function buildCaptainDailyReport(')+
   '\nreturn {captainDailyMissingTargets,captainDailySourceResults};')();
 const build=new Function('captainAuditWindow','getCaptainHistoricalOffTours',
  'captainOwnerTourDuty','localTodayKey',
  part('    function buildCaptainDailyReport(',
   '    function showCaptainHistoricalOffEditor(')+
  '\nreturn buildCaptainDailyReport;')(
  ()=>audit,()=>manual,ownerFunc,()=>'2026-11-15');
 return{ownerFunc,build,...helpers,ledger:manual};
}
function run(h){
 return h.build({
  checkId:'r1',setId:'set',setName:'Truck 504',
  auditAsOfDate:'2026-11-15',
  tourRoster:roster,owners:[brion,weems,other],
  items:[
   {assetId:'B-1',type:'Coat',ownerPrefix:brion.prefix},
   {assetId:'W-1',type:'Coat',ownerPrefix:weems.prefix},
   {assetId:'W-2',type:'Helmet',ownerPrefix:weems.prefix},
   {assetId:'G-1',type:'Coat',ownerPrefix:other.prefix}
  ],
  results:[
   {assetId:'B-1',ownerPrefix:brion.prefix,status:'ok',tour:{dates:[]}},
   {assetId:'W-1',ownerPrefix:weems.prefix,status:'ok',
      tour:{dates:['2026-11-09'],latestDate:'2026-11-09'}},
   {assetId:'W-2',ownerPrefix:weems.prefix,status:'ok',tour:{dates:[]}},
   {assetId:'G-1',ownerPrefix:other.prefix,status:'error',tour:{dates:[]}}
  ]
 });
}
function item(report,owner,asset){
 return report.owners.find(x=>x.prefix===owner).items.find(i=>i.assetId===asset);
}
test('a swing person real historical inspection remains green, without retroactive due',()=>{
 const h=harness(),r=run(h);
 const checked=item(r,weems.prefix,'W-1').tourChecks[0];
 assert.equal(checked.due,false);
 assert.equal(checked.off,false);
 assert.equal(checked.notAssigned,true);
 assert.equal(checked.ok,true);
 assert.equal(checked.date,'2026-11-09');
 const owner=r.owners.find(x=>x.prefix===weems.prefix);
 assert.equal(owner.tourRequirementCount,2,
   'only current due tour requires the two items');
 assert.equal(owner.tourPassedCount,0);
});
test('other shift with no completed check is blank, not OFF, red or a missing scan target',()=>{
 const h=harness(),r=run(h);
 const blank=item(r,weems.prefix,'W-2').tourChecks[0];
 assert.equal(blank.due,false);
 assert.equal(blank.off,false);
 assert.equal(blank.notAssigned,true);
 assert.equal(blank.ok,false);
 const unknown=item(r,other.prefix,'G-1').tourChecks[0];
 assert.equal(unknown.due,false);
 assert.equal(unknown.off,false);
 assert.equal(unknown.notAssigned,true);
 assert.equal(unknown.ok,false);
 const targets=h.captainDailyMissingTargets(r).map(x=>x.assetId);
 assert.ok(!targets.includes('G-1'),
  'a different-shift person with no scheduled due tour is never missing');
 assert.deepEqual(targets.sort(),['B-1','W-1','W-2'],
  'only current assigned shifts have missing requirements');
 assert.equal(r.owners.find(x=>x.prefix===other.prefix).tourRequirementCount,0);
 assert.equal(r.owners.find(x=>x.prefix===brion.prefix).tourRequirementCount,2);
});
test('manual historical different shift on saved Captain Set member blanks that tour',()=>{
 const ledger={schemaVersion:1,entries:{
  'PERSON-BRION|2026-11-09':{
    source:'captain_manual',prefix:'PERSON-BRION',startDate:'2026-11-09',
    endDate:'2026-11-10',reason:'Different shift / other captain'
  }
 }};
 const h=harness(ledger),r=run(h);
 const blank=item(r,brion.prefix,'B-1').tourChecks[0];
 assert.equal(blank.off,false);
 assert.equal(blank.notAssigned,true);
 assert.equal(blank.due,false);
 assert.equal(blank.offReason,'Different shift / other captain');
 assert.equal(item(r,brion.prefix,'B-1').tourChecks[1].due,true);
});
test('historical vacation is still OFF*, not a different-shift blank',()=>{
 const ledger={schemaVersion:1,entries:{
  'PERSON-BRION|2026-11-09':{
    source:'captain_manual',prefix:'PERSON-BRION',startDate:'2026-11-09',
    endDate:'2026-11-10',reason:'Vacation'
  }
 }};
 const h=harness(ledger),r=run(h);
 const off=item(r,brion.prefix,'B-1').tourChecks[0];
 assert.equal(off.off,true);assert.equal(off.notAssigned,false);assert.equal(off.due,false);
});
test('renderer prioritizes completed native evidence then OFF*, else due X, else blank',()=>{
 const ui=part('    function showCaptainDailyReport(',
  '    function showCaptainDailySetPicker(');
 assert.match(ui,/const ok=item\.status==='ok' && tour\.ok===true && !!tour\.date/);
 assert.match(ui,/mark\.textContent=ok\?'✓':off\?/);
 assert.match(ui,/const notAssigned=tour\.notAssigned===true/);
 assert.match(ui,/const otherShiftDetail=notAssigned\?/);
 assert.match(ui,/DIFFERENT SHIFT \/ other captain/);
 assert.doesNotMatch(ui,/mark\.textContent=ok\?'✓':off\?[\s\S]{0,90}notAssigned\?'OFF'/);
});
test('swings are included in the same read-only native PPE inventory scan',()=>{
 const start=source.indexOf('    async function startCaptainDailyCheck(');
 assert.ok(start>0);
 const body=source.slice(start,start+5500);
 assert.match(body,/scanPpeCrewOwners\(owners/);
 assert.match(body,/set\.people/);
 assert.match(body,/discoverOwnerGear/);
 assert.match(source,/await readModeCompletionHistory\(verifiedItem, modeKey\)/);
});
