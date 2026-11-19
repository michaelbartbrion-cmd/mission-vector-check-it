'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const start=src.indexOf('  async function runPending() {');
const end=src.indexOf('  function tick() {',start);
assert.ok(start>0&&end>start);
const handler=src.slice(start,end);
function fixture({wrongForm=false}={}){
 const calls={wait:0,prepare:0,errors:[],messages:[],saved:[],pendingCleared:0};
 const body={innerText:'Angular loading shell...'};
 const pathname='/inspections/60443/questionaries/91719';
 let pending={kind:'daily',unitId:'60443',stage:'form',startedAt:Date.now()};
 const values={
  readPending:()=>pending,busy:false,inspectionId:()=> '60443',
  clearPending:()=>{calls.pendingCleared++;pending=null;},
  notify:(msg,error=false)=>calls.messages.push({msg,error}),
  t504Visible:()=>true,TASKS:{daily:{name:'63000-13 Tour Check'}},
  formId:()=> '91719',clean:x=>String(x||'').trim(),
  document:{body},captureIqError:(error,stage)=>calls.errors.push({error,stage}),
  waitForIqForm:async(kind,current)=>{
   calls.wait++;
   assert.equal(kind,'daily');
   assert.equal(current(),true);
   if(wrongForm)throw Error('This page is not the T504 63000-13 Tour Check questionnaire.');
   body.innerText='63000-13 Tour Check';
  },
  prepare:async()=>{
   calls.prepare++;
   assert.match(body.innerText,/63000-13 Tour Check/);
   return 'Save In Process clicked';
  },
  sessionStorage:{setItem:(k,v)=>calls.saved.push([k,v])},
  RESULT:'result',location:{pathname},
  isGroupPage:()=>false,attempts:0,visible:()=>true,PANEL:'rebel-iq-t504-panel',
  writePending:()=>{},setTimeout:()=>{}
 };
 const params=Object.keys(values);
 const run=new Function(...params,handler+'; return runPending;')(...params.map(k=>values[k]));
 return{run,calls};
}
test('Angular route appears before questionnaire title, but pending T504 form waits and prepares only after stable readiness',async()=>{
 const h=fixture();
 await h.run();
 assert.equal(h.calls.wait,1);
 assert.equal(h.calls.prepare,1);
 assert.equal(h.calls.saved.length,1);
 assert.deepEqual(h.calls.errors,[]);
 assert.equal(h.calls.pendingCleared,1);
 assert.ok(h.calls.messages.every(x=>!x.msg.includes('Wrong questionnaire open')));
});
test('A genuinely wrong native questionnaire fails closed without draft edits or Save In Process',async()=>{
 const h=fixture({wrongForm:true});
 await h.run();
 assert.equal(h.calls.wait,1);
 assert.equal(h.calls.prepare,0);
 assert.equal(h.calls.saved.length,0);
 assert.equal(h.calls.pendingCleared,1);
 assert.equal(h.calls.errors.length,1);
 assert.match(h.calls.errors[0].error.message,/not the T504/);
});
