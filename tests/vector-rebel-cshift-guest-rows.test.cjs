'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=source.indexOf('    function cPilotLocalGuestRows(');
const end=source.indexOf('    function cPilotSummaryText(',start);
assert.ok(start>0&&end>start,'Actual C-shift guest reconciliation is present');
const segment=source.slice(start,end);
const identity=name=>String(name||'').trim().toLowerCase();
const run=new Function('getCaptainDailyReport','masterNameKey',segment+
 '\nreturn cPilotLocalGuestRows;')(()=>null,identity);
const selected={tourStart:'2026-11-21',tourEnd:'2026-11-22',
 people:[{name:'Regular C',prefix:'REG'}]};
const base={tourRoster:{startDate:'2026-11-21',endDate:'2026-11-22',
 basePrefixes:['REG'],swingPrefixes:['GUEST','REG','NOT-HERE'],
 onByDate:{'2026-11-21':['REG','GUEST'],
           '2026-11-22':['REG']}},
 owners:[
 {name:'Regular C',prefix:'REG',items:[]},
 {name:'Other Shift Firefighter',prefix:'GUEST',items:[
  {assetId:'COAT',type:'Bunker Coat',inspectionModeKey:'tour',
   status:'ok',tourChecks:[{startDate:'2026-11-21',ok:true,date:'2026-11-21'}]},
  {assetId:'PANTS',type:'Bunker Pant',inspectionModeKey:'tour',
   status:'ok',tourChecks:[{startDate:'2026-11-21',ok:true,date:'2026-11-22'}]},
  {assetId:'MASK',type:'SCBA Face Mask',inspectionModeKey:'scbaTour',
   status:'ok',tourChecks:[{startDate:'2026-11-21',ok:true,date:'2026-11-21'}]}
 ]},
 {name:'Off-duty Other Shift',prefix:'NOT-HERE',items:[]}
 ]};
test('BC shows selected other-shift person only on the exact assigned day',()=>{
 const rows=run(selected,base);
 assert.equal(rows.length,1);
 const person=rows[0];
 assert.equal(person.name,'Other Shift Firefighter');
 assert.equal(person.temporaryGuest,true);
 assert.deepEqual(person.guestDates,['2026-11-21']);
 assert.equal(person.knownItems,2);
 assert.equal(person.verifiedItems,1);
 assert.equal(person.outstandingItems,1);
 assert.equal(person.maskKnownItems,1);
 assert.equal(person.maskVerifiedItems,1);
 assert.equal(person.lastNativeInspectionDate,'2026-11-21');
 assert.match(person.guestSource,/saved native Item Log/);
});
test('wrong-day native records for swing do not count as a checked day',()=>{
 const rows=run(selected,base);
 assert.equal(rows[0].verifiedItems,1,'Nov 22 pants check must not satisfy Nov 21 swing');
 assert.equal(rows[0].maskVerifiedItems,1);
});
test('no selected Captain roster means no guest assertion or invented duty',()=>{
 assert.deepEqual(run(selected,null),[]);
 assert.deepEqual(run(selected,{...base,tourRoster:{...base.tourRoster,
  startDate:'2026-11-15',endDate:'2026-11-16'}}),[]);
 assert.deepEqual(run({...selected,tourStart:'2026-11-27',tourEnd:'2026-11-28'},base),[]);
});
test('regular employees are not added twice as temporary guests',()=>{
 const existing={...selected,people:[...selected.people,
 {name:'Other Shift Firefighter',prefix:'GUEST'}]};
 assert.equal(run(existing,base).length,0);
});
