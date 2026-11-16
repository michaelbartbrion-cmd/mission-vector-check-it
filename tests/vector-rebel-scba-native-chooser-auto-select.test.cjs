'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const begin=source.indexOf('    function scbaAirpackSelectNativeTemplate() {');
const finish=source.indexOf('    // The 11-question Standard SCBA frame form',begin);
assert.ok(begin>=0&&finish>begin,'choosing native SCBA template function exists');
const body=source.slice(begin,finish)+'\nreturn scbaAirpackSelectNativeTemplate;';
const key='scba-native-queue-test';
function harness({version='3.2.72',phase='native_form_opened',existingForm=false,
 chooser=true,exactCard=true,wrongPath=false,alreadyChosen=false,activePpe=false}={}){
 const queue={inspectionVersion:version,phase,index:0,createdAt:Date.now(),items:[
  {name:'AP-04',href:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/12/item'}
 ],...(alreadyChosen?{chooserSelectionAttemptedAt:Date.now()}: {})};
 let state={...queue},clicks=0,submitClicks=0,events=[],statuses=[];
 const targetPath='/app/equipment/Standard/pool/299946/12/item';
 const loc={href:'https://app.vectorcheckit.us'+(wrongPath?'/main/asset-manager':targetPath),
  origin:'https://app.vectorcheckit.us',pathname:wrongPath?'/main/asset-manager':targetPath};
 const card={
  disabled:false,getAttribute:()=>null,
  click(){clicks++}
 };
 const choose=new Function('scbaAirpackReadNativeQueue','getRun',
  'location','currentInspection','findChooserRoot','visible',
  'findInspectionCardInChooser','SCBA_FRAME_INSPECTION_TITLE',
  'sessionStorage','SCBA_AIRPACK_NATIVE_HANDOFF_KEY',
  'setStatus','rebelCommandEvent','telemetrySafeErrorMessage',body)(
   ()=>state,()=>activePpe?{}:null,loc,()=>existingForm?{}:null,
   ()=>chooser?{}:null,()=>true,()=>exactCard?card:null,
   'SCBA Inspection',
   {setItem:(k,json)=>{assert.equal(k,key);state=JSON.parse(json)}},
   key,(msg)=>statuses.push(msg),(event,payload)=>{events.push({event,payload});return Promise.resolve();},
   v=>String(v||'')
  );
 return {choose,get:()=>({state,clicks,submitClicks,events,statuses})};
}
test('verified native SCBA chooser is selected once only, never submitted',()=>{
 const h=harness();
 assert.equal(h.choose(),true);
 assert.equal(h.get().clicks,1);
 assert.ok(h.get().state.chooserSelectionAttemptedAt);
 assert.equal(h.choose(),false);
 assert.equal(h.get().clicks,1);
 assert.equal(h.get().submitClicks,0);
 assert.equal(h.get().state.phase,'native_form_opened');
});
test('in-progress 3.2.64 SCBA queue can select exact chooser after update',()=>{
 const h=harness({version:'3.2.64'});
 assert.equal(h.choose(),true);
 assert.equal(h.get().clicks,1);
});
test('wrong asset, active PPE, existing form, already selected, or wrong phase is safe',()=>{
 for(const opts of [{wrongPath:true},{activePpe:true},{existingForm:true},
  {alreadyChosen:true},{phase:'open_item'},{version:'3.2.49'}]){
  const h=harness(opts);
  assert.equal(h.choose(),false);
  assert.equal(h.get().clicks,0);
  assert.equal(h.get().events.length,0);
 }
});
test('chooser with no exact SCBA Inspection card stops and emits a single diagnosis',()=>{
 const h=harness({exactCard:false});
 assert.equal(h.choose(),false);
 assert.equal(h.choose(),false);
 assert.equal(h.get().clicks,0);
 assert.equal(h.get().events.length,1);
 assert.equal(h.get().events[0].payload.errorType,'scba_template_not_found');
 assert.match(h.get().statuses[0],/paused.*chooser/);
});
test('if chooser arrives later, exact SCBA template can still be selected',()=>{
 const h=harness({chooser:false});
 assert.equal(h.choose(),false);
 assert.equal(h.get().clicks,0);
 assert.equal(h.get().events.length,0);
});
test('SCBA handoff requires physical approval before native submission and preserves paused states',()=>{
 assert.match(source,/scbaAirpackSubmitReviewedForm\(\)/);
 assert.match(source,/autoSubmitApproved:true/);
 assert.match(source,/I submitted this inspection/);
 assert.match(source,/autoSubmitApproved:true/);
 assert.match(source,/physicalInspectionConfirmedAt/);
 assert.match(source,/form_prefill_in_progress','form_review_required','wrong_template/);
 assert.match(source,/automatic retries are disabled/);
 assert.match(source,/Date\.now\(\)-queue\.openedAt>180000/);
});
