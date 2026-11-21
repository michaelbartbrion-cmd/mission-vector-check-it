'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const part=(a,b)=>{
 const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'source range '+a);
 return src.slice(i,j);
};
const regular={name:'Michael Brion',prefix:'BRION'};
const temporary={name:'Matthew Cashman',prefix:'CASHMAN'};
const tour=(start,end)=>({startDate:start,endDate:end,
 due:true,month:start.slice(0,7),eligibleDates:[start,end]});
const earlier=tour('2026-11-09','2026-11-10');
const first=tour('2026-11-15','2026-11-16');
const after=tour('2027-05-21','2027-05-22');
const auditWindow={asOfDate:'2027-05-22',months:['2026-11','2027-05'],
 tours:[earlier,first,after]};
const roster={startDate:first.startDate,endDate:first.endDate,
 basePrefixes:['BRION','CASHMAN'],swingPrefixes:[],
 assignmentWindows:{CASHMAN:{startDate:'2026-11-15',endDate:'2027-05-15'}},
 onByDate:{'2026-11-15':['BRION','CASHMAN'],
 '2026-11-16':['BRION','CASHMAN']}};
const obs=(date,status)=>({name:temporary.name,date,status,
 sourceQuality:'good_direct_capture'});
const helpers=new Function('captainHistoricalTourEnded','masterNameKey',
 'captainHistoricalOffFor','localTodayKey',
 part('    function captainScoutTourDuty(','    function captainDailyMissingTargets(')+
 '\nreturn {duty:captainOwnerTourDuty};')(
 ()=>true,s=>String(s||'').toLowerCase().trim(),()=>null,()=>'2026-11-16'
);
const due=(who,t,rosterArg=roster,records=[])=>
 helpers.duty(who,t,auditWindow,rosterArg,{},records);
test('a dated six-month member is not falsely due on earlier C-shift tours',()=>{
 const result=due(temporary,earlier,roster,[
  obs('2026-11-09','work_evidence'),obs('2026-11-10','work_evidence')]);
 assert.equal(result.due,false);
 assert.equal(result.off,false);
 assert.equal(result.unknown,false);
 assert.equal(result.notAssigned,true);
 assert.equal(result.assignmentSource,'outside_temporary_assignment');
});
test('a dated member is due when working ANY unit in an in-range tour',()=>{
 const result=due(temporary,first,roster,[obs('2026-11-15','work_evidence')]);
 assert.equal(result.due,true);
 assert.equal(result.assignmentSource,'scout_any_unit');
});
test('a dated member is not falsely due on tours after assignment ends',()=>{
 const result=due(temporary,after,roster,[obs('2027-05-21','work_evidence')]);
 assert.equal(result.notAssigned,true);
 assert.equal(result.due,false);
 assert.equal(result.unknown,false);
});
test('permanent Captain Set members remain subject to normal historical duty',()=>{
 const result=due(regular,earlier,roster,[
  {name:regular.name,date:'2026-11-09',status:'work_evidence',
   sourceQuality:'good_direct_capture'}]);
 assert.equal(result.due,true);
});
test('temporary member inside assignment with incomplete Scout history stays unknown',()=>{
 const result=due(temporary,earlier,{
  ...roster,assignmentWindows:{CASHMAN:{startDate:'2026-11-09',endDate:''}}
 },[obs('2026-11-09','partial_or_uncertain')]);
 assert.equal(result.unknown,true);
 assert.equal(result.notAssigned,undefined);
});
test('earlier real official PPE completion remains visible without fake required misses',()=>{
 const build=new Function('captainAuditWindow','getCaptainHistoricalOffTours',
 'captainOwnerTourDuty','localTodayKey',
 part('    function buildCaptainDailyReport(',
 '    function showCaptainHistoricalOffEditor(')+
 '\nreturn buildCaptainDailyReport;')(
 ()=>auditWindow,()=>({entries:{}}),helpers.duty,()=>'2026-11-16');
 const report=build({checkId:'r',setId:'c',setName:'C',auditAsOfDate:'2027-05-22',
 owners:[temporary],items:[{assetId:'CASHMAN-COAT',ownerPrefix:'CASHMAN',type:'Coat'}],
 results:[{assetId:'CASHMAN-COAT',ownerPrefix:'CASHMAN',
 status:'ok',tour:{dates:['2026-11-09']}}],discovery:[],
 tourRoster:roster,attendanceRecords:[]});
 const item=report.owners[0].items[0];
 const firstCell=item.tourChecks[0];
 assert.equal(firstCell.due,false);
 assert.equal(firstCell.ok,true);
 assert.equal(firstCell.notAssigned,true);
 assert.equal(report.generatedAt.length>0,true);
});
test('normalizer retains only valid selected members and valid temporary date ranges',()=>{
 const fn=new Function('clean','getMasterRosterState','validDateKey',
 part('    function normalizeCaptainSets(','    function normalizeCaptainRosterPrefixes(')+
 '\nreturn normalizeCaptainSets;')(
 s=>String(s||'').trim(),()=>({people:[]}),
 s=>/^\d{4}-\d\d-\d\d$/.test(String(s||''))?s:''
 );
 const sets=fn([{id:'s',name:'Crew',memberPrefixes:['CASHMAN','BRION'],
 assignmentWindows:{
  CASHMAN:{startDate:'2026-11-15',endDate:'2027-05-15'},
  BRION:{startDate:'2026-11-15',endDate:'2026-11-09'},
  STRANGER:{startDate:'2026-11-15',endDate:''}
 }}],[{prefix:'CASHMAN'},{prefix:'BRION'}]);
 assert.deepEqual(Object.keys(sets[0].assignmentWindows),['CASHMAN']);
 assert.equal(sets[0].assignmentWindows.CASHMAN.startDate,'2026-11-15');
});
test('report reads updated assignment windows from saved Captain Set without rescanning',()=>{
 const view=part('    function showCaptainDailyReport(',
 '    function showCaptainDailySetPicker(');
 assert.match(view,/savedWindows=savedSet\?\.assignmentWindows/);
 assert.match(view,/captainRebuildStoredDailyReport\(report\)/);
 assert.doesNotMatch(view.slice(0,view.indexOf('const rerunV4')),
   /startCaptainDailyCheck\(/);
 assert.match(src,/assignmentWindows:set\.assignmentWindows\|\|\{\}/);
});
test('date selection is inspector-controlled and no native inspection is added',()=>{
 const editor=part('            function renderEditor() {',
 '            newSet.onclick = () => {');
 assert.match(editor,/Temporary Captain Set assignment dates/);
 assert.match(editor,/Save temporary dates/);
 assert.match(editor,/Make permanent again/);
 assert.match(editor,/Save Captain Set/);
 assert.doesNotMatch(editor,/Submit Inspection/);
});
