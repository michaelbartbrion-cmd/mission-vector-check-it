
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
function fixture(frames,{delay=60000,busy=[],witness=[]}={}){
 let i=0,t=0,waits=0;
 const frame=()=>frames[Math.min(i,frames.length-1)]||[];
 const ctx={Date:{now:()=>t},snapshot:()=>({messages:frame().map((id,listPosition)=>({messageKey:id,listPosition})),assessment:{validRows:frame().length}}),
  mailBusy:()=>!!busy[Math.min(i,busy.length-1)],candidateRows:()=>frame(),
  hasExplicitEmptyFolderWitness:()=>!!witness[Math.min(i,witness.length-1)],
  wait:async()=>{i++;waits++;t+=delay}};
 vm.createContext(ctx);
 for(const [a,b] of [['async function stableSnapshot(','function mailListHosts('],['async function stableEmptyFolder(','function ']]){
   const start=src.indexOf(a);const end=src.indexOf(b,start+a.length);
   assert.ok(start>=0&&end>start);vm.runInContext(src.slice(start,end),ctx);
 }
 return {ctx,waits:()=>waits};
}
test('late background timer wakeups still inspect actual loaded native rows and require three matching observations',async()=>{
 const h=fixture([[],['actual'],['actual'],['actual']]);
 const s=await h.ctx.stableSnapshot(2200);
 assert.equal(s.settled,true);assert.equal(s.messages[0].messageKey,'actual');assert.equal(h.waits(),3);
});
test('never return an older larger viewport as a settled current viewport',async()=>{
 const h=fixture([['a','b','c'],[],[],[],[],[],[],[],[]]);
 const s=await h.ctx.stableSnapshot(2200);
 assert.equal(s.settled,false);assert.equal(s.messages.length,0);assert.equal(h.waits(),8);
});
test('native busy indicator resets stability rather than accepting stale rows',async()=>{
 const h=fixture([['a'],['a'],['a'],['b'],['b'],['b']],{delay:220,busy:[true,true,true,false,false,false]});
 const s=await h.ctx.stableSnapshot(2200);assert.equal(s.settled,true);assert.equal(s.messages[0].messageKey,'b');
});
test('explicit empty folder still requires six real witnesses even with background timer delay',async()=>{
 const h=fixture([[]],{witness:[true]});
 assert.equal(await h.ctx.stableEmptyFolder(),true);assert.equal(h.waits(),5);
 const x=fixture([[]],{witness:[false]});
 assert.equal(await x.ctx.stableEmptyFolder(),false);
});

