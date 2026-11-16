'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=source.indexOf('    function scbaAirpackCompletedReceipt() {');
const b=source.indexOf('    function scbaAirpackFillNativeFailureDetails() {',a);
assert.ok(a>0&&b>a,'native completed receipt verifier');
const code=source.slice(a,b)+'\nreturn scbaAirpackCompletedReceipt;';
function harness({badge=true,form=true,instance='9592549',itemLog=false,
 phase='native_submit_clicked',length=2,completedLink='9592549',
 linkLabel='SCBA InspectionCOMPLETE',verifiedAsset=true,version='3.2.74'}={}){
 let state={
  inspectionVersion:version,autoSubmitApproved:true,
  phase,submittedFormInstance:instance,
  submitAttemptedAt:Date.now()-2000,
  index:0,items:Array.from({length},(_,i)=>({
   name:'AP-'+(4+i),result:'present_working',
   href:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/'+(12+i)+'/item'
  }))
 };
 let saved=null,cleared=false,navigated='',message='';
 const pageText='SCBA Inspection\n'+(badge?'Complete on November 15, 2026':'Back to Equipment Inspection History');
 const link={href:'https://app.vectorcheckit.us/app/equipment/inspection/113271/inspection-instance/'+completedLink,
  innerText:linkLabel,textContent:linkLabel,closest:()=>null};
 const document={body:{innerText:pageText},
  querySelectorAll:selector=>selector==='a[href]'&&itemLog?[link]:[]};
 const fn=new Function(
 'scbaAirpackReadNativeQueue','currentInspection','SCBA_FRAME_INSPECTION_TEMPLATE',
 'SCBA_FRAME_INSPECTION_TITLE','document','uiText','isCompletedInspectionView',
 'apparatusVerifiedItemPage','historyRows','findItemLogHistoryTable',
 'rowLooksLikeCompletedModeEntry','inspectionFromUrl','GM_setValue',
 'SCBA_AIRPACK_DRAFT_KEY','sessionStorage','SCBA_AIRPACK_NATIVE_HANDOFF_KEY',
 'setStatus','location','visible','PANEL_ID','OVERLAY_ID',
 'SCBA_AIRPACK_NATIVE_BANNER_ID',code)(
 ()=>state,()=>form?{template:'113271',instance}:null,
 '113271','SCBA Inspection',document,x=>String(x).trim(),
 ()=>badge,()=>itemLog&&verifiedAsset,()=>[],()=>({}),
 ()=>true,url=>({template:'113271',instance:url.split('/').at(-1)}),
 (_key,value)=>{saved=value},'draft',
 {setItem:(_key,value)=>{state=JSON.parse(value)},removeItem:()=>{cleared=true}},
 'queue',value=>{message=value},{assign:url=>{navigated=url}},
 ()=>true,'panel','overlay','banner'
 );
 return{fn,get:()=>({state,saved,cleared,navigated,message})};
}
test('exact native Completed-form badge advances to next verified SCBA, not more submissions',()=>{
 const x=harness();assert.equal(x.fn(),true);
 assert.equal(x.get().state.index,1);
 assert.equal(x.get().state.phase,'open_item');
 assert.equal(x.get().state.officialCompleted.length,1);
 assert.equal(x.get().state.officialCompleted[0].formInstance,'9592549');
 assert.equal(x.get().state.officialCompleted[0].proofSource,'native_completed_form');
 assert.equal(x.get().state.officialCompleted[0].officialReceiptVerified,true);
 assert.match(x.get().navigated,/\/13\/item$/);
});
test('no completion badge or wrong instance never advances',()=>{
 for(const opts of [{badge:false},{instance:'wrong',completedLink:'9592549',form:false},
 {phase:'form_prefilled'}]){
  const x=harness(opts);assert.equal(x.fn(),false);
  assert.equal(x.get().navigated,'');
 }
});
test('live Vector 11/15 AP-04 SCBA InspectionCOMPLETE hyperlink with exact native instance advances',()=>{
 const x=harness({form:false,itemLog:true,length:2,instance:'9592591',
  completedLink:'9592591',linkLabel:'SCBA InspectionCOMPLETE'});
 assert.equal(x.fn(),true);
 assert.equal(x.get().state.index,1);
 assert.equal(x.get().state.officialCompleted[0].formInstance,'9592591');
 assert.equal(x.get().state.officialCompleted[0].proofSource,'exact_completed_item_log_link');
 assert.match(x.get().navigated,/\/13\/item$/);
});
test('native equipment Item Log with a completed link to exact instance can advance',()=>{
 const x=harness({form:false,itemLog:true,length:1});
 assert.equal(x.fn(),true);
 assert.equal(x.get().cleared,true);
 assert.equal(x.get().saved.officialReceiptVerified,true);
 assert.equal(x.get().saved.items[0].proofSource,'exact_completed_item_log_link');
});
test('native Item Log for a different SCBA inspection cannot verify current item',()=>{
 const x=harness({form:false,itemLog:true,completedLink:'other'});
 assert.equal(x.fn(),false);
 assert.equal(x.get().cleared,false);
});

test('an incomplete SCBA link or another asset page cannot count as official completion',()=>{
 for(const opts of [
  {form:false,itemLog:true,linkLabel:'SCBA InspectionINCOMPLETE'},
  {form:false,itemLog:true,linkLabel:'SCBA Inspection'},
  {form:false,itemLog:true,linkLabel:'Another InspectionCOMPLETE'},
  {form:false,itemLog:true,verifiedAsset:false},
  {form:false,itemLog:true,completedLink:'wrong'}
 ]){
  const x=harness(opts);
  assert.equal(x.fn(),false);
  assert.equal(x.get().navigated,'');
 }
});

test('a still-open authorized 3.2.66 SCBA queue advances after the version upgrade',()=>{
 const x=harness({version:'3.2.66',form:false,itemLog:true,
  length:2,completedLink:'9592591',instance:'9592591'});
 assert.equal(x.fn(),true);
 assert.equal(x.get().state.index,1);
 assert.equal(x.get().state.inspectionVersion,'3.2.66');
 assert.equal(x.get().state.autoSubmitApproved,true);
});
