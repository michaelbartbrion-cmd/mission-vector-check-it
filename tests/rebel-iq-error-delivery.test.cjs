'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const injected=source.replace(/\}\)\(\);\s*$/, 'globalThis.__iqTest={captureIqError,flushIqErrors,readIqErrors};\n})();');
assert.notEqual(injected,source,'test hooks are injected into VM only, not production source');
function createHarness({ack=true,online=true}={}){
 const store=new Map(),requests=[];
 const context={
   window:{addEventListener(){}},document:{body:null},
   location:{pathname:'/inspections/60421/questionaries/91546'},
   crypto:crypto.webcrypto,btoa,console,
   setInterval(){return 1},
   GM_getValue:(key,fallback)=>store.has(key)?store.get(key):fallback,
   GM_setValue:(key,value)=>store.set(key,value),
   fetch:async(url,opt)=>{
     requests.push({kind:'enroll',url,body:JSON.parse(opt.body)});
     if(!online)throw Error('No network');
     return {ok:true,status:200,json:async()=>({ok:true,deviceId:'riq-test-device'})};
   },
   GM_xmlhttpRequest:opt=>{
     requests.push({kind:'report',url:opt.url,headers:opt.headers,body:JSON.parse(opt.data)});
     opt.onload({status:ack?200:503,responseText:ack?
       JSON.stringify({ok:true,acceptedSuggestions:1,duplicateSuggestions:0}):
       JSON.stringify({ok:false,error:'unavailable'})});
   }
 };
 vm.runInNewContext(injected,context);
 return {store,requests,context,flush:()=>context.__iqTest.flushIqErrors(),
   capture:(err,stage)=>context.__iqTest.captureIqError(err,stage),
   pending:()=>context.__iqTest.readIqErrors()};
}
async function settle(){await new Promise(r=>setImmediate(r));}
test('delivers one redacted error to Rebel Command and removes it after acknowledged receipt',async()=>{
 const h=createHarness();
 h.capture(new Error('Question 42 failed for 5633595'), 'daily:prepare');
 await settle();
 assert.equal(h.pending().length,0);
 const enrollment=h.requests.find(x=>x.kind==='enroll');
 const send=h.requests.find(x=>x.kind==='report');
 assert.equal(enrollment.body.program,'Rebel IQ');
 assert.equal(enrollment.body.profileName,'Truck 504');
 assert.equal(send.body.suggestions.length,1);
 assert.equal(send.body.suggestions[0].category,'feedback');
 assert.equal(send.body.suggestions[0].sourceContext,'automatic_error');
 assert.ok(send.body.suggestions[0].details.includes('[id]'));
 assert.ok(!send.body.suggestions[0].details.includes('5633595'));
 assert.ok(!send.body.suggestions[0].details.includes('token'));
 assert.equal(send.headers['X-Rebel-Device-ID'],'riq-test-device');
 assert.match(send.headers.Authorization,/^Bearer /);
});
test('a server rejection retains the queued error, then retry clears only after confirmed receipt',async()=>{
 const h=createHarness({ack:false});
 h.capture(Error('T504 unexpected choices'), 'weekly:prepare');
 await settle();
 assert.equal(h.pending().length,1);
 const pendingId=h.pending()[0].suggestionId;
 h.context.GM_xmlhttpRequest=opt=>{
   h.requests.push({kind:'report-retry',body:JSON.parse(opt.data)});
   opt.onload({status:200,responseText:JSON.stringify({ok:true,acceptedSuggestions:0,duplicateSuggestions:1})});
 };
 assert.equal(await h.flush(),true);
 assert.equal(h.pending().length,0);
 assert.equal(h.requests.find(x=>x.kind==='report-retry').body.suggestions[0].suggestionId,pendingId);
});
test('failed enrollment retains errors and a duplicate error does not flood the queue',async()=>{
 const h=createHarness({online:false});
 h.capture(new Error('No serial match'), 'daily:prepare');
 h.capture(new Error('No serial match'), 'daily:prepare');
 await settle();
 assert.equal(h.pending().length,1);
 assert.equal(h.requests.filter(x=>x.kind==='report').length,0);
});
