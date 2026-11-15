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
 phase='native_submit_clicked',length=2,completedLink='9592549'}={}){
 let state={
  inspectionVersion:'3.2.66',autoSubmitApproved:true,
  phase,submittedFormInstance:instance,
  submitAttemptedAt:Date.now()-2000,
  index:0,items:Array.from({length},(_,i)=>({
   name:'AP-'+(4+i),result:'present_working',
   href:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/'+(12+i)+'/item'
  }))
 };
 let saved=null,cleared=false,navigated='',message='';
 const pageText='SCBA Inspection\n'+(badge?'Complete on November 15, 2026':'Back to Equipment Inspection History');
 const row={querySelectorAll:()=>[{href:'https://app.vectorcheckit.us/app/equipment/inspection/113271/inspection-instance/'+completedLink}]};
 const fn=new Function(
 'scbaAirpackReadNativeQueue','currentInspection','SCBA_FRAME_INSPECTION_TEMPLATE',
 'SCBA_FRAME_INSPECTION_TITLE','document','uiText','isCompletedInspectionView',
 'apparatusVerifiedItemPage','historyRows','findItemLogHistoryTable',
 'rowLooksLikeCompletedModeEntry','inspectionFromUrl','GM_setValue',
 'SCBA_AIRPACK_DRAFT_KEY','sessionStorage','SCBA_AIRPACK_NATIVE_HANDOFF_KEY',
 'setStatus','location',code)(
 ()=>state,()=>form?{template:'113271',instance}:null,
 '113271','SCBA Inspection',{body:{innerText:pageText}},x=>String(x),
 ()=>badge,()=>itemLog,()=>itemLog?[row]:[],()=>({}),
 ()=>true,url=>({instance:url.split('/').at(-1)}),
 (_key,value)=>{saved=value},'draft',
 {setItem:(_key,value)=>{state=JSON.parse(value)},removeItem:()=>{cleared=true}},
 'queue',value=>{message=value},{assign:url=>{navigated=url}}
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
test('native equipment Item Log with a completed row linked to this exact instance can advance',()=>{
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
