'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function section(a,b){
 const x=source.indexOf(a),y=source.indexOf(b,x+a.length);
 assert.ok(x>=0&&y>x,'expected section '+a);
 return source.slice(x,y);
}
function harness(){
 const memory=new Map();
 const validDateKey=key=>/^\d{4}-\d{2}-\d{2}$/.test(key||'')?key:'';
 const addDateKeyDays=(key,days)=>{
  const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
 };
 const localTodayKey=()=>'2026-11-15';
 const loadJSON=(key,fallback)=>memory.has(key)?JSON.parse(memory.get(key)):fallback;
 const saveJSON=(key,value)=>memory.set(key,JSON.stringify(value));
 const clean=x=>String(x||'').trim();
 const getConfig=()=>({inspectorName:'Michael Brion'});
 let realBuild=null;
 const snapshot=section('    function captainHistoricalTourEnded(',
  '    function captainOwnerTourDuty(');
 const provider=new Function('validDateKey','addDateKeyDays','localTodayKey',
  'loadJSON','saveJSON','clean','getConfig',
  'captainDailySourceResults','buildCaptainDailyReport','CAPTAIN_HISTORICAL_OFF_KEY',
  snapshot+'\nreturn {captainHistoricalTourEnded,getCaptainHistoricalOffTours,'+
  'captainHistoricalOffFor,captainRecordHistoricalOff,captainClearHistoricalOff,'+
  'captainRebuildStoredDailyReport,captainScoutTourDuty};')(
  validDateKey,addDateKeyDays,localTodayKey,loadJSON,saveJSON,clean,getConfig,
  r=>realFuncs.captainDailySourceResults(r),c=>realBuild(c),
  'vectorRebelCaptainHistoricalOff_v1');
 const regular=section('    function captainOwnerTourDuty(',
  '    function captainDailyMissingTargets(');
 const ownerFn=new Function('captainHistoricalOffFor','localTodayKey',
  'captainScoutTourDuty',regular+
  '\nreturn captainOwnerTourDuty;')(
   provider.captainHistoricalOffFor,localTodayKey,provider.captainScoutTourDuty);
 const allHelpers=section('    function captainDailyMissingTargets(',
  '    function buildCaptainDailyReport(');
 const realFuncs=new Function(allHelpers+
  '\nreturn {captainDailyMissingTargets,captainDailySourceResults};')();
 const tours=[
  {month:'2026-11',startDate:'2026-11-09',endDate:'2026-11-10',
   eligibleDates:['2026-11-09','2026-11-10'],due:true},
  {month:'2026-11',startDate:'2026-11-15',endDate:'2026-11-16',
   eligibleDates:['2026-11-15'],due:true}
 ];
 const auditWindow={asOfDate:'2026-11-15',months:['2026-10','2026-11'],tours};
 const build=section('    function buildCaptainDailyReport(',
  '    function showCaptainHistoricalOffEditor(');
 realBuild=new Function('captainAuditWindow','getCaptainHistoricalOffTours',
  'captainOwnerTourDuty','localTodayKey',build+
  '\nreturn buildCaptainDailyReport;')(
  ()=>auditWindow,provider.getCaptainHistoricalOffTours,ownerFn,localTodayKey);
 const owners=[
  {prefix:'PERSON-BRION',name:'Michael Brion'},
  {prefix:'PERSON-WEEMS',name:'Jerry Weems'}
 ];
 const roster={startDate:'2026-11-15',endDate:'2026-11-16',
  basePrefixes:owners.map(x=>x.prefix),onByDate:{
   '2026-11-15':owners.map(x=>x.prefix),
   '2026-11-16':owners.map(x=>x.prefix)}};
 const items=[
  {ownerPrefix:'PERSON-BRION',assetId:'B-1',type:'Coat',url:'https://host/B-1'},
  {ownerPrefix:'PERSON-BRION',assetId:'B-2',type:'Pants',url:'https://host/B-2'},
  {ownerPrefix:'PERSON-WEEMS',assetId:'W-1',type:'Coat',url:'https://host/W-1'}
 ];
 const results=items.map(item=>({
  ownerPrefix:item.ownerPrefix,assetId:item.assetId,status:'ok',
  tour:{dates:item.assetId==='B-2'?['2026-11-09']:[],latestDate:''}
 }));
 const check={
  checkId:'historic-1',setName:'Captain Crew',setId:'set-1',
  displayGeneratedAt:'2026-11-14T12:00:00.000Z',
  auditAsOfDate:'2026-11-15',owners,items,results,discovery:[],tourRoster:roster
 };
 return {...provider,...realFuncs,ownerFn,realBuild,items,owners,roster,tours,
  auditWindow,results,check,memory,loadJSON,saveJSON};
}
function pick(report,owner,asset,which=0){
 return report.owners.find(o=>o.prefix===owner).items
  .find(i=>i.assetId===asset).tourChecks[which];
}
test('regular historic tour is required before any off evidence and missing is red',()=>{
 const h=harness(),res=h.realBuild(h.check);
 assert.equal(pick(res,'PERSON-BRION','B-1').due,true);
 assert.equal(pick(res,'PERSON-BRION','B-1').off,false);
 assert.equal(pick(res,'PERSON-WEEMS','W-1').due,true);
 assert.equal(h.captainDailyMissingTargets(res).length,3);
});
test('explicit recorded entire-tour OFF removes required red cells across all PPE for one person only',()=>{
 const h=harness(),tour=h.tours[0];
 const written=h.captainRecordHistoricalOff(h.owners[0],tour,'Vacation','Out both shifts');
 assert.equal(written.source,'captain_manual');
 assert.equal(written.recordedBy,'Michael Brion');
 assert.equal(written.reason,'Vacation');
 const res=h.realBuild(h.check);
 const first=pick(res,'PERSON-BRION','B-1');
 assert.equal(first.due,false);
 assert.equal(first.off,true);
 assert.equal(first.offSource,'captain_manual');
 assert.equal(first.offReason,'Vacation');
 assert.equal(first.offNote,'Out both shifts');
 assert.equal(pick(res,'PERSON-BRION','B-2').off,true);
 assert.equal(pick(res,'PERSON-BRION','B-1',1).due,true,
  'current tour remains required for this person');
 assert.equal(pick(res,'PERSON-WEEMS','W-1').due,true,
  'other person is never excused');
 const remaining=h.captainDailyMissingTargets(res);
 assert.equal(remaining.length,3,'current tour and other owner still missing');
 assert.ok(remaining.some(x=>x.assetId==='B-2'),
  'current tour remains due even if this item had completed an earlier tour');
});
test('native completed history remains visible even when absence was recorded',()=>{
 const h=harness();
 h.captainRecordHistoricalOff(h.owners[0],h.tours[0],'Regular days off / not assigned');
 const r=h.realBuild(h.check);
 const item=pick(r,'PERSON-BRION','B-2');
 assert.equal(item.off,true);
 assert.equal(item.ok,true);
 assert.equal(item.date,'2026-11-09','native history is preserved');
 assert.equal(r.owners[0].items[1].tourDates[0],'2026-11-09');
});
test('unverified future/current tours cannot be manually excused',()=>{
 const h=harness();
 assert.equal(h.captainHistoricalTourEnded(h.tours[1],new Date('2026-11-15T16:00:00')),false);
 assert.throws(()=>h.captainRecordHistoricalOff(h.owners[0],h.tours[1],'Sick'),
  /both shifts have finished/);
 assert.throws(()=>h.captainRecordHistoricalOff(h.owners[0],h.tours[0],''),
  /Select a reason/);
 assert.equal(h.getCaptainHistoricalOffTours().schemaVersion,1);
 assert.deepEqual(Object.keys(h.getCaptainHistoricalOffTours().entries),[]);
});
test('two-day tour cannot be mistakenly marked OFF while its second shift still active',()=>{
 const h=harness();
 const t={startDate:'2026-11-13',endDate:'2026-11-14'};
 assert.equal(h.captainHistoricalTourEnded(t,new Date('2026-11-15T05:00:00')),false);
 assert.equal(h.captainHistoricalTourEnded(t,new Date('2026-11-15T07:00:00')),true);
});
test('removing a manual OFF restores requirements without touching official inspection dates',()=>{
 const h=harness(),old=h.realBuild(h.check);
 h.captainRecordHistoricalOff(h.owners[0],h.tours[0],'Sick');
 assert.equal(pick(h.realBuild(h.check),'PERSON-BRION','B-1').off,true);
 assert.equal(h.captainClearHistoricalOff(h.owners[0],h.tours[0]),true);
 const updated=h.realBuild(h.check);
 assert.equal(pick(updated,'PERSON-BRION','B-1').due,true);
 assert.equal(pick(updated,'PERSON-BRION','B-1').off,false);
 assert.deepEqual(updated.owners[0].items[1].tourDates,
  old.owners[0].items[1].tourDates);
 assert.equal(h.captainClearHistoricalOff(h.owners[0],h.tours[0]),false);
});
test('existing v8 report rebuild preserves native audit timestamp and recheck outcome',()=>{
 const h=harness();
 const prior=h.realBuild({...h.check,
   recheckTargets:[{ownerPrefix:'PERSON-BRION',assetId:'B-1'}],
   recheckCount:1});
 prior.elapsedMs=123000;
 prior.timingSampleCount=9;
 h.captainRecordHistoricalOff(h.owners[0],h.tours[0],'Vacation');
 const edited=h.captainRebuildStoredDailyReport(prior);
 assert.equal(edited.elapsedMs,123000);
 assert.equal(edited.timingSampleCount,9);
 assert.equal(edited.generatedAt,prior.generatedAt,
  'editing attendance is not a new native item log scan');
 assert.deepEqual(edited.recheckSummary,prior.recheckSummary,
  'manual OFF is not counted as newly verified by Recheck');
 assert.deepEqual(edited.recheckedAssets,prior.recheckedAssets);
 assert.ok(edited.attendanceEditedAt);
 assert.equal(pick(edited,'PERSON-BRION','B-1').off,true);
 assert.deepEqual(edited.sourceSnapshot.results,prior.sourceSnapshot.results);
});
test('legacy v7 report can be edited and keeps old positive inspection evidence',()=>{
 const h=harness();
 const report=h.realBuild(h.check);
 report.schemaVersion=7;delete report.sourceSnapshot;
 h.captainRecordHistoricalOff(h.owners[0],h.tours[0],'Vacation');
 const edited=h.captainRebuildStoredDailyReport(report);
 assert.equal(edited.schemaVersion,8);
 assert.equal(pick(edited,'PERSON-BRION','B-1').off,true);
 assert.equal(edited.owners[0].items[1].tourDates[0],'2026-11-09');
});
test('full backup includes this separate historical captain attendance ledger',()=>{
 assert.match(source,/const CAPTAIN_HISTORICAL_OFF_KEY =/);
 const keys=section('    const PORTABLE_BACKUP_KEYS = [','    function getOrCreateTabId(');
 assert.match(keys,/CAPTAIN_HISTORICAL_OFF_KEY/);
 assert.match(source,/saveJSON\(CAPTAIN_HISTORICAL_OFF_KEY,ledger\)/);
});
test('report allows direct red-X editing, shows OFF* and restore, never starts PPE inspection',()=>{
 const ui=section('    function showCaptainHistoricalOffEditor(',
  '    function showCaptainDailySetPicker(');
 assert.match(ui,/Past Tour: Correct Attendance/);
 assert.match(ui,/recordedBy/);
 assert.match(ui,/I confirm this firefighter was off or assigned to a different crew for BOTH shifts/);
 assert.match(ui,/captainRecordHistoricalOff\(owner,tour,reasonSelect.value/);
 assert.match(ui,/captainClearHistoricalOff\(owner,tour\)/);
 assert.match(ui,/mark\.onclick=\(\)=>showCaptainHistoricalOffEditor\(report,overlay/);
 assert.match(ui,/OFF\*/);
 assert.match(ui,/Edit Past Attendance/);
 const editor=section('    function showCaptainHistoricalOffEditor(',
  '    function showCaptainDailyReport(');
 assert.doesNotMatch(editor,/submitInspection|startInspection|startPpeRun|base44\.entities/);
});
