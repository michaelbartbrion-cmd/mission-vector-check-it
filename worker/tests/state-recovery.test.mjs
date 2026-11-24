import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverLostState,eligible,health,claim,complete,POLICY} from '../scheduler.mjs';
test('corruption recovery preserves uncertainty, quarantines stale leases and reserves budget',()=>{
 const now=new Date('2026-11-24T19:00:00Z');
 const s=recoverLostState(now);
 const tab={role:'ppe',ready:true,dedicated:true,busy:false,tabId:'recovery-fixture',seenAtMs:now.getTime()};
 assert.equal(eligible(s,'ppe',tab,now).why,'state_recovery_lease_quarantine');
 const h=health(s,[],now);
 assert.equal(h.ppe.completedToday,null);
 assert.equal(h.ppe.priorRotationCountUnknown,true);
 assert.equal(h.ppe.budgetReserve,41);
 assert.equal(h.ppe.lastSuccessAt,null);
 const after=new Date(now.getTime()+POLICY.ppeLeaseMs+1);
 tab.seenAtMs=after.getTime();
 const task=claim(s,'ppe',tab,after);
 assert.equal(task.granted,true);
 assert.equal(complete(s,'ppe',tab.tabId,task.id,'no_work',after).recorded,true);
 assert.equal(health(s,[tab],after).ppe.recoveredRotationCount,1);
 s.ppe.count=90-h.ppe.budgetReserve;
 const later=new Date(after.getTime()+POLICY.ppeMinGapMs+1);tab.seenAtMs=later.getTime();
 assert.equal(eligible(s,'ppe',tab,later).why,'daily_ppe_budget_exhausted');
 const tomorrow=new Date('2026-11-25T13:06:00Z');tab.seenAtMs=tomorrow.getTime();
 assert.equal(eligible(s,'ppe',tab,tomorrow).allowed,true);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
test('real broker restarts from all-zero state, preserves bytes and denies new claims during quarantine',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'mvci-corrupt-test-'));
 const raw=Buffer.alloc(12068);
 fs.writeFileSync(path.join(home,'state.json'),raw);
 const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
 const child=spawn(process.execPath,[path.join(import.meta.dirname,'..','daemon.mjs')],{env:{...process.env,MVCI_WORKER_PORT:String(port),MVCI_WORKER_HOME:home},stdio:'ignore',windowsHide:true});
 const closed=new Promise(r=>child.once('close',r));
 try{
  const base='http://127.0.0.1:'+port;
  let h;
  for(let i=0;i<50;i++){try{h=await(await fetch(base+'/health')).json();break}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal(h?.ok,true);assert.equal(h.ppe.priorRotationCountUnknown,true);
  assert.equal(h.ppe.lastSuccessAt,null);assert.equal(h.lease,null);
  const files=fs.readdirSync(home).filter(f=>f.startsWith('state.json.corrupt-'));
  assert.equal(files.length,1);assert.deepEqual(fs.readFileSync(path.join(home,files[0])),raw);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home,'state.json'),'utf8')).schema,1);
  const call=async(route,data)=>await(await fetch(base+'/v1/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-MVCI-Collector':'v1'},body:JSON.stringify({role:'ppe',tabId:'isolated-corruption-test',...data})})).json();
  assert.equal((await call('heartbeat',{ready:true,dedicated:true,busy:false})).ok,true);
  const result=await call('claim',{});assert.equal(result.granted,false);assert.equal(result.reason,'state_recovery_lease_quarantine');
 }finally{child.kill();await closed;fs.rmSync(home,{recursive:true,force:true});}
});

