'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const raw=src.match(/const SCBA_FRAME_INSPECTION_QUESTIONS = Object.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(raw,'11 native SCBA questions are defined');
const questions=(new Function('return ['+raw[1]+']'))();
const uiText=t=>String(t||'').replace(/\s+/g,' ').trim();
const equal=(a,b)=>uiText(a).toLowerCase()===uiText(b).toLowerCase();
const BEGIN=src.indexOf('    function scbaAirpackOfficialAnswersMatch(item) {');
const END=src.indexOf('    function scbaAirpackCompletedReceipt() {',BEGIN);
assert.ok(BEGIN>=0&&END>BEGIN);
const code=src.slice(BEGIN,END)+'\nreturn {match:scbaAirpackOfficialAnswersMatch,recover:scbaAirpackRecoverCompletedForm,submit:scbaAirpackSubmitReviewedForm};';
function harness({approved=true,checked=true,phase='form_prefilled',answers=null,
  template='113271',wrongInstance=false,extraSubmit=false,version='3.2.73'}={}){
 const expected=questions.map((_,i)=>answers?.[i]||'pass');
 const text=questions.map((q,i)=>q+'\n'+(expected[i]==='pass'?'Passed':'Failed')).join('\n');
 let clicks=0,status='',state={
  inspectionVersion:version,phase,autoSubmitApproved:approved,
  physicalInspectionConfirmedAt:checked?'2026-11-15T18:00:00Z':null,
  formInstance:'9592549',formTemplate:'113271',items:[{name:'AP-04',
    result:'present_working',href:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/12/item'}],
  index:0
 };
 const button={innerText:'Submit Inspection',textContent:'Submit Inspection',
  disabled:false,getAttribute:()=>null,closest:()=>null,click(){clicks++}};
 const steps=questions.map((q,i)=>({
  innerText:q+'\n'+(expected[i]==='pass'?'Passed':'Failed'),
  textContent:q+'\n'+(expected[i]==='pass'?'Passed':'Failed'),
  classList:{contains:name=>name==='completed'},closest:()=>null
 }));
 const document={
  body:{innerText:text},
  querySelectorAll:selector=>selector==='.inspection__step-item'?steps:
    selector==='textarea'?[]:selector==='button,[role="button"]'?
    (extraSubmit?[button,button]:[button]):[]
 };
 const fn=new Function(
  'scbaAirpackReadNativeQueue','getRun','currentInspection',
  'SCBA_FRAME_INSPECTION_TEMPLATE','SCBA_FRAME_INSPECTION_QUESTIONS',
  'SCBA_FRAME_INSPECTION_TITLE','document','uiText','uiEquals','visible',
  'PANEL_ID','OVERLAY_ID','SCBA_AIRPACK_NATIVE_BANNER_ID','scbaAirpackReadyNativeAnswers',
  'isCompletedInspectionView','sessionStorage','SCBA_AIRPACK_NATIVE_HANDOFF_KEY',
  'setStatus','uiIncludes','enabledButton',code)(
  ()=>state,()=>null,()=>({template,instance:wrongInstance?'wrong':'9592549'}),
  '113271',questions,'SCBA Inspection',document,uiText,equal,()=>true,
  'panel','overlay','banner',
  item=>item.result==='present_working'?Array(11).fill('pass'):null,()=>false,
  {setItem(_key,value){state=JSON.parse(value)}},'scba-test-key',msg=>{status=msg},
  (a,b)=>uiText(a).toLowerCase().includes(uiText(b).toLowerCase()),()=>false
 );
 return {...fn,document,steps,get:()=>({state,clicks,status})};
}
test('submits 11 reviewed Passed responses just once after explicit physical authorization',()=>{
 const h=harness();
 assert.equal(h.match({result:'present_working'}),true);
 assert.equal(h.submit(),true);
 assert.equal(h.get().clicks,1);
 assert.equal(h.get().state.phase,'native_submit_clicked');
 assert.equal(h.get().state.submittedFormInstance,'9592549');
 assert.equal(h.submit(),false);
 assert.equal(h.get().clicks,1,'never send a duplicate official inspection');
});
test('never submits without explicit consent, without completed physical check, or outside prefilled state',()=>{
 for(const opts of [{approved:false},{checked:false},{phase:'native_form_opened'},
   {template:'other'},{wrongInstance:true},{extraSubmit:true}]){
  const h=harness(opts);
  assert.equal(h.submit(),false);
  assert.equal(h.get().clicks,0);
 }
});
test('re-checks 11 native response labels and refuses changed or incomplete answers',()=>{
 const h=harness();
 h.steps[0].innerText=h.steps[0].innerText.replace('Passed','Failed');
 assert.equal(h.submit(),false);
 assert.equal(h.get().clicks,0);
 assert.equal(h.get().state.phase,'form_prefilled',
  'a transient mismatch must not permanently abort on first read');
 h.get().state.submitValidationPendingSince=Date.now()-14000;
 assert.equal(h.submit(),false);
 assert.equal(h.get().state.phase,'form_review_required');
});
test('does not confuse a merely filled form with a native submission receipt',()=>{
 const a=src.indexOf('    function scbaAirpackCompletedReceipt() {');
 const b=src.indexOf('    function scbaAirpackFillNativeFailureDetails() {',a);
 assert.ok(a>0&&b>a);
 const receipt=src.slice(a,b);
 assert.match(receipt,/Complete\(\?:d\)\? on/);
 assert.match(receipt,/id\.instance!==q\.submittedFormInstance/);
 assert.match(receipt,/officialReceiptVerified:true/);
 assert.match(receipt,/expectedLabel\+'COMPLETE'/);
 assert.match(receipt,/expectedLabel\+'COMPLETED'/);
 assert.match(receipt,/phase:'open_item'/);
});
test('native failed inspection final submit requires exact selected airpack and matching required note',()=>{
 const a=src.indexOf('    function scbaAirpackFinalizeFailure() {');
 const b=src.indexOf('    function scbaAirpackReturnToItemForReceipt() {',a);
 assert.ok(a>0&&b>a);
 const modal=src.slice(a,b);
 assert.match(modal,/failureNotePreparedFor!==q\.submittedFormInstance/);
 assert.match(modal,/rows\[0\]\.classList\?\.contains\('selected'\)/);
 assert.match(modal,/clean\(input\[0\]\.value\)!==clean\(item\.comment\|\|''\)/);
 assert.match(modal,/phase:'native_failure_submit_clicked'/);
 assert.match(modal,/submits\[0\]\.click\(\)/);
});
test('live native form remains visible to the helper after the inspected answers are filled',()=>{
 const a=src.indexOf('    async function scbaAirpackShowNativeHandoff() {');
 const b=src.indexOf('    // APPARATUS CHECK: read-only',a);
 const handoff=src.slice(a,b);
 assert.match(handoff,/if\(!isItemPage && currentInspection\(\)\)/);
 assert.match(handoff,/I physically checked this SCBA: Submit & Continue/);
 assert.match(handoff,/autoSubmitApproved:true/);
});

test('an authorized 3.2.66 queue remains safe to continue after upgrade',()=>{
 const h=harness({version:'3.2.66'});
 assert.equal(h.submit(),true);
 assert.equal(h.get().clicks,1);
 assert.equal(h.submit(),false);
 assert.equal(h.get().clicks,1);
});

test('React hydration finishing after initial mismatch permits one safe native submission',()=>{
 const h=harness();
 h.steps[10].innerText=h.steps[10].innerText.replace('Passed','');
 assert.equal(h.submit(),false);
 assert.equal(h.get().clicks,0);
 assert.equal(h.get().state.phase,'form_prefilled');
 h.steps[10].innerText=questions[10]+'\nPassed';
 assert.equal(h.submit(),true);
 assert.equal(h.get().clicks,1);
 assert.equal(h.submit(),false);
 assert.equal(h.get().clicks,1);
});
test('real Voyager AP-60 5/7 already completed Passed rows resume from 3.2.67 pause',()=>{
 const h=harness({version:'3.2.67',phase:'form_review_required'});
 assert.equal(h.recover(),true);
 assert.equal(h.get().state.phase,'form_prefilled');
 assert.equal(h.get().clicks,0,'recovery must not click any selected answer');
 assert.equal(h.submit(),true);
 assert.equal(h.get().clicks,1,'exact native form submits once');
 assert.equal(h.submit(),false);
});
test('recovery never modifies partial or wrong form or any submit-attempted queue',()=>{
 for(const opt of [{checked:false},{approved:false},{wrongInstance:true},
  {phase:'native_submit_clicked'}]){
  const h=harness({...opt,phase:opt.phase||'form_review_required'});
  assert.equal(h.recover(),false);
  assert.equal(h.get().clicks,0);
 }
 const partial=harness({phase:'form_review_required'});
 partial.steps[9].classList.contains=()=>false;
 assert.equal(partial.recover(),false);
 assert.equal(partial.get().clicks,0);
 const submitted=harness({phase:'form_review_required'});
 submitted.get().state.submitAttemptedAt=Date.now();
 assert.equal(submitted.recover(),false);
});
