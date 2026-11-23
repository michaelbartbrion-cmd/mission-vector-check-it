'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const start=source.indexOf('function apiOnce(method,payload=null)');
const end=source.indexOf('const request=payload=>api(',start);
assert.ok(start>=0&&end>start,'production request implementation is available');
function fixture(responses){
 const seen=[],delays=[],traces=[];
 const ctx={
  DEFAULT_ENDPOINT:'https://example.test/bridge',
  cfg:()=>({deviceId:'postmaster-device',token:'test-token',endpoint:'https://example.test/bridge'}),
  clean:x=>String(x||'').trim(),
  trace:(type,data)=>traces.push({type,...data}),
  wait:async ms=>{delays.push(ms)},
  GM_xmlhttpRequest:opts=>{
   seen.push(opts);
   const response=responses[seen.length-1]||responses.at(-1);
   if(response.type==='network')return opts.onerror();
   if(response.type==='timeout')return opts.ontimeout();
   opts.onload({status:response.status,responseText:JSON.stringify(response.body||{})});
  }
 };
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end)+'\nglobalThis.run=api;',ctx);
 return {ctx,seen,delays,traces};
}
test('definitive telemetry HTTP500 safely reuses exact same captureId and body',async()=>{
 const f=fixture([{status:500,body:{ok:false,error:'Telemetry unavailable'}},{status:200,body:{ok:true,workEmail:{accepted:true,duplicate:true}}}]);
 const payload={workEmailCapture:{captureId:'workmail:stable-test',messages:[{messageKey:'outlook:id1'}]}};
 const out=await f.ctx.run('POST',payload);
 assert.equal(out.workEmail.accepted,true);
 assert.equal(f.seen.length,2);
 assert.equal(f.seen[0].data,f.seen[1].data,'request body must not be regenerated on retry');
 assert.equal(JSON.parse(f.seen[1].data).workEmailCapture.captureId,'workmail:stable-test');
 assert.deepEqual(f.delays,[1500]);
 assert.equal(f.traces[0].type,'bridge_mail_receipt_retry');
});
test('single-folder state upsert can retry a definitive completed telemetry 500',async()=>{
 const f=fixture([{status:500,body:{ok:false,error:'Telemetry unavailable'}},{status:200,body:{ok:true,workEmailIngestionState:{accepted:true}}}]);
 const r=await f.ctx.run('POST',{workEmailIngestionState:{folderId:'folder:1',updatedAt:'2026-11-23T22:20:00Z'}});
 assert.equal(r.workEmailIngestionState.accepted,true);
 assert.equal(f.seen.length,2);
});
test('ambiguous network and timeout errors never retry',async()=>{
 for(const type of ['network','timeout']){
  const f=fixture([{type}]);
  await assert.rejects(f.ctx.run('POST',{workEmailCapture:{captureId:'stable'}}),/Network/);
  assert.equal(f.seen.length,1);
  assert.equal(f.delays.length,0);
 }
});
test('unsafe body, authorization error or unrecognized server failure never retries',async()=>{
 for(const [status,body,payload] of [
  [500,{error:'Telemetry unavailable'},{otherOperation:true}],
  [401,{error:'Invalid device credentials'},{workEmailCapture:{captureId:'stable'}}],
  [500,{error:'Unknown application failure'},{workEmailCapture:{captureId:'stable'}}]
 ]){
  const f=fixture([{status,body}]);
  await assert.rejects(f.ctx.run('POST',payload));
  assert.equal(f.seen.length,1);
  assert.equal(f.delays.length,0);
 }
});
test('definitive 500 retries are bounded to three attempts beyond first, then fail closed',async()=>{
 const f=fixture([{status:500,body:{error:'Telemetry unavailable'}}]);
 await assert.rejects(f.ctx.run('POST',{workEmailCapture:{captureId:'stable'}}),/Telemetry unavailable/);
 assert.equal(f.seen.length,4);
 assert.deepEqual(f.delays,[1500,3000,6000]);
});
test('existing rate-limit backoff stays intact',async()=>{
 const f=fixture([{status:429,body:{error:'Rate limit exceeded'}},{status:200,body:{ok:true}}]);
 await f.ctx.run('GET');
 assert.equal(f.seen.length,2);
 assert.deepEqual(f.delays,[2000]);
});
