'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    function captainTourRequiredItem(item) {');
const b=src.indexOf('    function captainDailyMissingTargets(report) {',a);
assert.ok(a>=0&&b>a,'Captain Tour required-gear scope helpers');
const modes={
 tour:{templates:{'300045':'112411','300036':'118098','299879':'118114',
  '299882':'118117','299900':'118109','299881':'118110'}},
 scbaTour:{templates:{'299947':'119122'}}
};
const check=(it)=>!!it&&Array.isArray(it.basePrefixes)&&
  !it.basePrefixes.includes('SWING');
const factory=new Function('clean','getMode','SCBA_FACE_MASK_POOL',
 'captainIsTemporarySwing','captainHistoricalOffFor','masterNameKey',
 src.slice(a,b)+'\nreturn {eligible:captainTourRequiredItem,days:captainTourWorkDays};');
const api=factory(v=>String(v||'').trim(),m=>modes[m],'299947',
 (owner,roster)=>owner.prefix==='SWING'&&check(roster),
 ()=>null,v=>String(v||'').toLowerCase().trim());
test('only native-mapped required Tour PPE and SCBA Face Mask are included',()=>{
 const pool=['300045','300036','299879','299882','299900','299881'];
 for(const [p,template] of Object.entries(modes.tour.templates)){
  assert.equal(api.eligible({pool:p,template,inspectionModeKey:'tour'}),true);
 }
 assert.equal(api.eligible({pool:'299947',template:'119122',inspectionModeKey:'scbaTour'}),true);
 assert.equal(api.eligible({pool:'299896',type:'Dual Certification Coat',inspectionModeKey:'tour'}),false);
 assert.equal(api.eligible({pool:'300006',type:'Wildland Helmet',inspectionModeKey:'tour'}),false);
 modes.tour.templates['299896']='CUSTOM-FORM';
 assert.equal(api.eligible({pool:'299896',template:'CUSTOM-FORM',inspectionModeKey:'tour'}),false,
  'a future custom form cannot silently expand the ten-item scope');
 delete modes.tour.templates['299896'];
 assert.equal(api.eligible({pool:'299947',template:'wrong',inspectionModeKey:'scbaTour'}),false);
 assert.equal(api.eligible({pool:'300045',template:'113025',inspectionModeKey:'afterFire'}),false);
 assert.equal(api.eligible({pool:'300045',template:'random',inspectionModeKey:'tour'}),false);
 assert.equal(api.eligible({pool:'300045',template:'112411',inspectionModeKey:'captain'}),false);
 assert.equal(api.eligible({inspectionModeKey:'tour'}),true,'legacy already-read gear without a stored pool');
});
const tour={startDate:'2026-11-15',endDate:'2026-11-16'};
const roster={basePrefixes:['REGULAR'],swingPrefixes:['SWING'],...tour,
 onByDate:{'2026-11-15':['REGULAR','SWING'],'2026-11-16':['REGULAR']}};
const regular={name:'Regular',prefix:'REGULAR'},swing={name:'Swing',prefix:'SWING'};
test('selected other-shift firefighter has work status on the exact chosen day only',()=>{
 const statuses=api.days(swing,tour,{},roster,[],{},{}).map(x=>x.status);
 assert.deepEqual(statuses,['SW','']);
 const previous=api.days(swing,{startDate:'2026-11-09',endDate:'2026-11-10'},
  {},roster,
  [{name:'Swing',date:'2026-11-09',status:'work_evidence',sourceQuality:'good_direct_capture'}],{},{});
 assert.deepEqual(previous.map(x=>x.status),['','']);
});
test('regular crew has distinct per-day captain assignment, not assumed full-tour duty',()=>{
 assert.deepEqual(api.days(regular,tour,{},roster,[],{},{})
  .map(x=>x.status),['W*','W*']);
 const oneDay={...roster,onByDate:{'2026-11-15':['REGULAR'],'2026-11-16':[]}};
 assert.deepEqual(api.days(regular,tour,{},oneDay,[],{},{})
  .map(x=>x.status),['W*','—']);
});
test('older crew work labels require trusted per-day Scout evidence; unknown is not OFF',()=>{
 const past={startDate:'2026-11-03',endDate:'2026-11-04'};
 const events=[
  {name:'Regular',date:'2026-11-03',status:'work_evidence',sourceQuality:'good_direct_capture'},
  {name:'Regular',date:'2026-11-04',status:'deployment_evidence',sourceQuality:'good_direct_capture'}
 ];
 assert.deepEqual(api.days(regular,past,{},roster,events,{},{}).map(x=>x.status),['W','DEP']);
 assert.deepEqual(api.days(regular,past,{},roster,events.slice(0,1),{},{}).map(x=>x.status),['W','?']);
 assert.deepEqual(api.days(regular,past,{},roster,[
  {...events[0],sourceQuality:'partial_untrusted'}],{},{}).map(x=>x.status),['?','?']);
});
test('Captain report stores one work row per person, filters non-tour gear and binds swing completion date',()=>{
 const start=src.indexOf('    function buildCaptainDailyReport(check) {');
 const end=src.indexOf('    function showCaptainHistoricalOffEditor(',start);
 assert.ok(start>0&&end>start);
 const build=new Function('captainAuditWindow','getCaptainHistoricalOffTours',
  'captainTourRequiredItem','captainOwnerTourDuty','captainTourWorkDays',
  'captainIsTemporarySwing',src.slice(start,end)+
  '\nreturn buildCaptainDailyReport;')(
  ()=>({...tour,shift:'C',asOfDate:'2026-11-16',months:['2026-11'],
   tours:[{...tour,month:'2026-11',eligibleDates:['2026-11-15','2026-11-16'],due:true}]}),
  ()=>({}),api.eligible,
  (owner)=>({due:true,off:false,dutyDates:owner.prefix==='SWING'?
   ['2026-11-15']:['2026-11-15','2026-11-16'],
   assignmentSource:owner.prefix==='SWING'?'swing_selected_tour':'captain_selected_tour'}),
  api.days,(owner,r)=>owner.prefix==='SWING'
 );
 const pools=Object.keys(modes.tour.templates);
 const gear=Array.from({length:10},(_,i)=>{
  const pool=pools[i%pools.length];return{
   ownerPrefix:'REGULAR',assetId:'R'+i,type:'Required '+i,
   pool,template:modes.tour.templates[pool],inspectionModeKey:'tour'
  };
 });
 gear.push({ownerPrefix:'REGULAR',assetId:'MASK',type:'SCBA Face Mask',
  pool:'299947',template:'119122',inspectionModeKey:'scbaTour'});
 gear.push({ownerPrefix:'REGULAR',assetId:'EXTRA',type:'Wildland Helmet',
  pool:'300006',inspectionModeKey:'tour'});
 gear.push({ownerPrefix:'SWING',assetId:'SW',type:'Coat',
  pool:'300045',template:'112411',inspectionModeKey:'tour'});
 const native=gear.map(item=>({
  ownerPrefix:item.ownerPrefix,assetId:item.assetId,status:'ok',
  tour:{dates:item.assetId==='SW'?['2026-11-16']:['2026-11-15'],
   exhaustive:true}
 }));
 const report=build({shift:'C',auditAsOfDate:'2026-11-16',
  owners:[regular,swing],items:gear,results:native,checkId:'TEST',
  setId:'C',setName:'C shift',tourRoster:roster});
 assert.equal(report.owners[0].items.length,11,'ten mapped structural pieces plus SCBA mask');
 assert.equal(report.owners[0].items.some(x=>x.assetId==='EXTRA'),false);
 assert.equal(report.owners[0].items.at(-1).inspectionModeKey,'scbaTour');
 assert.deepEqual(report.owners[0].workTours[0].days.map(x=>x.status),['W*','W*']);
 assert.equal(report.owners[1].items[0].tourChecks[0].ok,false,
  'native check on swing unassigned day must not appear as their assigned-day check');
 assert.equal(report.owners[1].items[0].tourChecks[0].date,'');
 assert.deepEqual(report.owners[1].workTours[0].days.map(x=>x.status),['SW','']);
 // Source completeness applies to the moment the Item Log was read.
 // A later shift cannot be called missing based on an earlier full scan.
 const before=build({shift:'C',auditAsOfDate:'2026-11-16',
  owners:[regular,swing],items:gear,checkId:'EARLY',tourRoster:roster,
  results:native.map(x=>({...x,readAt:'2026-11-16T16:00:00Z',
    tour:{dates:[],exhaustive:true}}))});
 assert.equal(before.owners[0].items[0].tourChecks[0].historyCoversTour,false);
 const after=build({shift:'C',auditAsOfDate:'2026-11-18',
  owners:[regular,swing],items:gear,checkId:'LATE',tourRoster:roster,
  results:native.map(x=>({...x,readAt:'2026-11-18T17:00:00Z',
    tour:{dates:[],exhaustive:true}}))});
 assert.equal(after.owners[0].items[0].tourChecks[0].historyCoversTour,true);
});
