'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    function captainApplyConfirmedPilotDuty(');
const b=source.indexOf('    function showCaptainDailySetPicker()',a);
assert.ok(a>=0&&b>a,'original Captain checker has the verified read-only duty preselection');
const helper=new Function('masterNameKey',source.slice(a,b)+
 '\nreturn captainApplyConfirmedPilotDuty;')(
 value=>String(value||'').toLowerCase().trim());
const dates=['2026-11-21','2026-11-22'];
const makeEntries=()=>new Map([
 ['A',{person:{name:'Firefighter A',prefix:'A'},base:true,day1:true,day2:true}],
 ['B',{person:{name:'Firefighter B',prefix:'B'},base:true,day1:true,day2:true}],
 ['G',{person:{name:'Visiting Guest',prefix:'G'},base:false,day1:true,day2:false}]
]);
const board={shift:'C',activeTour:true,tourStart:dates[0],tourEnd:dates[1],
 people:[
  {name:'Firefighter A',prefix:'A',dutyDay1:'working',dutyDay2:'off',
   lastDutyConfirmedAt:'2026-11-21T15:20:04Z'},
  {name:'Firefighter B',prefix:'B',dutyDay1:'off',dutyDay2:'off',
   lastDutyConfirmedAt:'2026-11-21T15:20:04Z'},
  {name:'Visiting Guest',prefix:'G',dutyDay1:'unknown',dutyDay2:'unknown',
   lastDutyConfirmedAt:''}
 ]};
test('today C shift preselects saved Captain-confirmed duty and leaves unknown guests intact',()=>{
 const entries=makeEntries();
 assert.equal(helper(entries,board,dates),3);
 assert.deepEqual([entries.get('A').day1,entries.get('A').day2],[true,false]);
 assert.deepEqual([entries.get('B').day1,entries.get('B').day2],[false,false]);
 assert.deepEqual([entries.get('G').day1,entries.get('G').day2],[true,false]);
});
test('wrong shift, finished tour and mismatched days never rewrite Captain roster',()=>{
 for(const different of [
  {...board,shift:'A'}, {...board,activeTour:false},
  {...board,tourStart:'2026-11-15'}, {...board,tourEnd:'2026-11-23'}
 ]){
  const entries=makeEntries();
  assert.equal(helper(entries,different,dates),0);
  assert.equal(entries.get('B').day1,true);
 }
});
test('partial or unconfirmed duty never means OFF and never silently changes crew state',()=>{
 const entries=makeEntries();
 const partial={...board,people:[
  {name:'Firefighter A',prefix:'A',dutyDay1:'unknown',dutyDay2:'off',
   lastDutyConfirmedAt:'2026-11-21T15:20:04Z'},
  {name:'Firefighter B',prefix:'B',dutyDay1:'off',dutyDay2:'off',
   lastDutyConfirmedAt:''}
 ]};
 assert.equal(helper(entries,partial,dates),1);
 assert.equal(entries.get('A').day1,true,'unknown day did not become off');
 assert.equal(entries.get('A').day2,false);
 assert.equal(entries.get('B').day1,true,'unconfirmed old record never overrides picker');
});
test('strict prefix and exact normalized name prevent applying a different firefighter duty record',()=>{
 const entries=makeEntries();
 const mismatched={...board,people:[
  {name:'Firefighter B',prefix:'A',dutyDay1:'off',dutyDay2:'off',
   lastDutyConfirmedAt:'2026-11-21T15:20:04Z'},
  {name:'Firefighter B',prefix:'B',dutyDay1:'off',dutyDay2:'off',
   lastDutyConfirmedAt:'2026-11-21T15:20:04Z'},
  {name:'Firefighter B',prefix:'B',dutyDay1:'working',dutyDay2:'working',
   lastDutyConfirmedAt:'2026-11-21T15:20:04Z'}
 ]};
 assert.equal(helper(entries,mismatched,dates),0);
 assert.equal(entries.get('A').day1,true);
 assert.equal(entries.get('B').day1,true);
});
test('first-time Captain picker gates late automated preselect after manual user edits',()=>{
 const picker=source.slice(b,source.indexOf('    async function startCaptainDailyMissingRecheck(',b));
 assert.match(picker,/rosterAdjusted=true/);
 assert.match(picker,/if\(!overlay\.isConnected\|\|rosterAdjusted/);
 assert.match(picker,/cPilotFetch\(true,initialDays\[0\]\)/);
 assert.match(picker,/captainApplyConfirmedPilotDuty\(/);
 assert.doesNotMatch(picker,/PpePilotDuty\.update|CrewSense\.update/);
});
test('original picker defaults to current C-shift Captain Set, not last saved shift',()=>{
 const a=source.indexOf("        const last = persistentGetRaw(CAPTAIN_LAST_SET_KEY)");
 const b=source.indexOf('        const selectedCaptainShift=',a);
 assert.ok(a>0&&b>a,'current shift selection from the real picker exists');
 const snippet=source.slice(a,b)+'\nreturn select.value;';
 const run=new Function('usableSets','select','persistentGetRaw','CAPTAIN_LAST_SET_KEY',
  'localTodayKey','inferRegularTourWindow','captainShiftLabel',snippet);
 const choices=[{id:'A-set',shift:'A'},{id:'C-set',shift:'C'}];
 const infer=(date,shift)=>({isActiveTour:shift==='C'});
 const selected=run(choices,{},()=> 'A-set','last',()=> '2026-11-21',infer,x=>x);
 assert.equal(selected,'C-set','today C shift beats a stale last-selected A shift');
 const same=run(choices,{},()=> 'C-set','last',()=> '2026-11-21',infer,x=>x);
 assert.equal(same,'C-set');
});
