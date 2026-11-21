import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
const script=path.join(import.meta.dirname,'..','daemon.mjs');
const port=await new Promise((resolve,reject)=>{
 const server=net.createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{
  const p=server.address().port;server.close(()=>resolve(p));
 });
});
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mvci-broker-test-'));
const agent=spawn(process.execPath,[script],{
 env:{...process.env,MVCI_WORKER_PORT:String(port),
 MVCI_WORKER_HOME:home},stdio:['ignore','pipe','pipe'],windowsHide:true
});
const base='http://127.0.0.1:'+port;
async function ready(){
 for(let i=0;i<40;i++){
  try{const x=await fetch(base+'/health');if(x.ok)return}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('Broker did not start');
}
const tab='enterprise-test-worker-1';
async function call(route,data={},header=true){
 return fetch(base+'/v1/'+route,{method:'POST',
  headers:{'Content-Type':'application/json',
    ...(header?{'X-MVCI-Collector':'v1'}:{})},
  body:JSON.stringify({role:'ppe',tabId:tab,...data})});
}
test('local worker denies unapproved clients, enforces one lease and persists healthy status',async()=>{
 try{
  await ready();
  assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await call('heartbeat',{ready:true,dedicated:true},false)).status,403);
  assert.equal((await call('claim')).status,409,'heartbeat required');
  assert.equal((await call('heartbeat',{ready:true,dedicated:true,busy:false})).status,200);
  const a=await(await call('claim')).json();
  assert.equal(a.granted,true);
  assert.equal(a.kind,'ppe-one-readonly-rotation');
  const second=await(await call('claim')).json();
  assert.equal(second.granted,false);
  assert.equal(second.reason,'one_global_lease_active');
  const bad=await call('complete',{id:a.id,outcome:'official_pass'});
  assert.equal(bad.status,409,'illegal compliance outcomes rejected');
  const good=await call('complete',{id:a.id,outcome:'no_work'});
  assert.equal(good.status,200);
  const h=await(await fetch(base+'/health')).json();
  assert.equal(h.lease,null);
  assert.equal(h.ppe.clientState,'ready');
  assert.equal(h.ppe.completedToday,1);
  assert.equal(h.limits.noOfficialInspectionSubmissions,true);
  const raw=fs.readFileSync(path.join(home,'state.json'),'utf8');
  assert.equal(raw.includes('session_token'),false);
  assert.equal(raw.includes('person_name'),false);
 }finally{
  agent.kill();
  await new Promise(r=>agent.once('close',r));
  fs.rmSync(home,{recursive:true,force:true});
 }
});
