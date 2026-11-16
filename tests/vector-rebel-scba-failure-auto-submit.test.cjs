'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    function scbaAirpackFinalizeFailure() {');
const b=src.indexOf('    function scbaAirpackReportUnverifiedReceipt() {',a);
assert.ok(a>0&&b>a,'native failure finalization source');
const code=src.slice(a,b)+'\nreturn scbaAirpackFinalizeFailure;';
const norm=s=>String(s||'').trim().toLowerCase();
const eq=(a,b)=>norm(a)===norm(b),inc=(a,b)=>norm(a).includes(norm(b));
function make({approved=true,select=true,matchNote=true,correctItem=true,
 phase='native_submit_clicked',attempted=false,withModal=true}={}){
 let clicks=0,stored=null,status='';
 const item={name:'AP-45',result:'issue',comment:'Regulator leaking'};
 let q={inspectionVersion:'3.2.74',phase,autoSubmitApproved:approved,
  physicalInspectionConfirmedAt:'2026-11-15T18:01:00Z',
  failureNotePreparedFor:'9592549',submittedFormInstance:'9592549',
  index:0,items:[item],...(attempted?{failureFinalSubmitAt:Date.now()}: {})};
 const btn={disabled:false,innerText:'Submit Inspection',textContent:'Submit Inspection',
  click(){clicks++}};
 const itemLeaf={children:[],innerText:correctItem?'AP-45':'AP-33'};
 const row={classList:{contains:()=>select},querySelectorAll:()=>[itemLeaf]};
 const input={value:matchNote?'Regulator leaking':'Different note',
  getAttribute:()=> 'Add a note for the failure'};
 const modal={innerText:'FAILURE DETAILS SELECT FAILING ITEMS Failure Notes',
  querySelectorAll:selector=>selector==='textarea,input[placeholder]'?[input]:
    selector==='.equipment-items__item-list'?[row]:
    selector==='button,[role="button"]'?[btn]:[]};
 const fn=new Function('scbaAirpackReadNativeQueue','getRun',
  'currentInspection','SCBA_FRAME_INSPECTION_TEMPLATE','document',
  'visible','uiIncludes','uiEquals','clean','sessionStorage',
  'SCBA_AIRPACK_NATIVE_HANDOFF_KEY','setStatus',code)(
  ()=>q,()=>null,()=>({template:'113271',instance:'9592549'}),
  '113271',{querySelectorAll:()=>withModal?[modal]:[]},()=>true,inc,eq,
  v=>String(v||'').trim(),{setItem:(_key,value)=>{q=JSON.parse(value);stored=q}},
  'key',v=>status=v);
 return{fn,get:()=>({clicks,q,stored,status})};
}
test('physically authorized reviewed failure submits exact notes once only',()=>{
 const h=make();assert.equal(h.fn(),true);
 assert.equal(h.get().clicks,1);assert.equal(h.get().q.phase,'native_failure_submit_clicked');
 assert.equal(h.fn(),false);assert.equal(h.get().clicks,1);
});
test('no failure submit if note is different, failing airpack wrong/unselected or modal missing',()=>{
 for(const opts of [{approved:false},{select:false},{matchNote:false},
 {correctItem:false},{phase:'form_prefilled'},{attempted:true},{withModal:false}]){
  const h=make(opts);assert.equal(h.fn(),false);assert.equal(h.get().clicks,0);
 }
});
