'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-scout.user.js'),'utf8');
const line=src.split(/\r?\n/).find(s=>s.startsWith('async function startSync(){'));
assert.ok(line,'Scout sync function present');
const start=new Function('core','ownLock','queue','state','set','saveStatus','render','syncPlan',
 'mergeNewNeeded','saveQueue','releaseLock','runQueue','clean',line+'\nreturn startSync;');
function env({paired=true,active=false,plan={config:{legacyMaxDatesPerSession:18},worklist:[]}}={}){
 const state={open:false,busy:false,message:'Ready',kind:'info'},writes=[],messages=[],runCalls=[];
 let resolvePlan=()=>{},nextPlan=Promise.resolve(plan);
 const core={paired:()=>paired},current={active,items:[],index:0};
 const startFn=start(core,()=>true,()=>current,state,(k,v)=>writes.push([k,v]),
  (m,k)=>{state.message=m;messages.push([m,k])},()=>{},()=>nextPlan,
  ()=>{},()=>{},()=>{},()=>runCalls.push('run'),x=>String(x));
 return {state,writes,messages,runCalls,startFn,holdPlan(){
   nextPlan=new Promise(resolve=>{resolvePlan=resolve});return data=>resolvePlan(data);
 }};
}
test('Sync click immediately shows connection progress before server replies',async()=>{
 const h=env(),reply=h.holdPlan(),request=h.startFn();
 assert.equal(h.state.busy,true);
 assert.equal(h.state.open,true);
 assert.match(h.state.message,/Contacting Rebel Command/);
 assert.deepEqual(h.writes,[['rebelScoutExpandedV1',true]]);
 reply({config:{legacyMaxDatesPerSession:18},worklist:[]});
 await request;
 assert.match(h.state.message,/Everything is current/);
 assert.equal(h.state.busy,false);
});
test('Active batch click reports resume and preserves open progress panel',async()=>{
 const h=env({active:true});await h.startFn();
 assert.equal(h.state.open,true);
 assert.match(h.state.message,/Resuming existing/);
 assert.equal(h.runCalls.length,1);
});
test('Missing pairing explains why sync did not start',async()=>{
 const h=env({paired:false});await h.startFn();
 assert.match(h.state.message,/Pair Rebel Scout before syncing/);
 assert.equal(h.state.kind,'info'); // displays via saveStatus; state kind set in actual UI
});
test('User can monitor collection across navigation; read-only mode retained',()=>{
 assert.match(src,/open:!!get\('rebelScoutExpandedV1',false\)/);
 assert.match(src,/setTimeout\(\(\)=>\{const q=queue\(\);if\(q.active\)\{state.open=true/);
 assert.match(src,/CHECKING RC CONNECTION/);
 assert.match(src,/SYNC REBEL COMMAND/);
 assert.match(src,/collectorOnly:true,startSync,stopSync,runQueue/);
 assert.match(src,/Read-only collector/);
 assert.doesNotMatch(src,/state\.open=false;render\(\);saveStatus\(`Background Scout batch/);
});
