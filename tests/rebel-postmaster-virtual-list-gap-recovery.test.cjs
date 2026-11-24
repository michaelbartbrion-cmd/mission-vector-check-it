
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const a=source.indexOf('function listScroller(){'),b=source.indexOf('function mailBusy(){',a);
assert.ok(a>0&&b>a);
function env(snapshots=[],opts={}){
 class Element {
  constructor(parent=null,overflow='hidden',native=false){this.parentElement=parent;this.scrollHeight=1000;this.clientHeight=200;this.overflow=overflow;this.classList={contains:s=>native&&s==='customScrollBar'};this.isConnected=true;this.scrollTop=0;this.closest=()=>null}
  contains(row){for(let n=row;n;n=n.parentElement)if(n===this)return true;return false}
 }
 const body=new Element(),outer=new Element(body,'auto'),host=new Element(outer,'auto',true),
 preview=new Element(host,'auto'),row1=new Element(preview),row2=new Element(host);
 let idx=0,waits=0;
 const ctx={HTMLElement:Element,document:{body,querySelectorAll:()=>opts.hosts==='ambiguous'?[host,outer]:opts.hosts==='one'?[host]:[]},nativeMessageListRegion:()=>true,containsNativeMessageList:()=>false,candidateRows:()=>[row1,row2],mailListHosts:()=>[outer],visible:()=>true,getComputedStyle:e=>({overflowY:e.overflow}),
  stableSnapshot:async()=>({messages:snapshots[Math.min(idx++,snapshots.length-1)]||[]}),credibleMessageRow:m=>!!m.valid,mailBusy:()=>opts.busy||false,
  crawlMatchesPage:()=>opts.same!==false,crawlAbort:false,wait:async()=>{waits++}};
 vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);
 return{ctx,host,outer,preview,waits:()=>waits};
}
test('actual common native scroll host wins over overflowing nested message preview',()=>{
 const h=env();
 assert.equal(h.ctx.listScroller(),h.host);
});
test('explicit retry rewinds failed cursor but keeps all acknowledged stable IDs',()=>{
 const h=env(),s={status:'error',seen:['id1','id2'],steps:21,lastTop:6511};
 h.ctx.resetFailedCrawlCursor(s);
 assert.equal(s.steps,0);assert.equal(s.lastTop,0);assert.deepEqual(s.seen,['id1','id2']);
 const p={status:'paused',seen:['id1'],steps:3,lastTop:500};h.ctx.resetFailedCrawlCursor(p);
 assert.equal(p.lastTop,500);
});
test('virtualized loading gap waits for credible rows rather than scrolling past them',async()=>{
 const row={valid:true,id:'real'};const h=env([[],[],[row]]);
 assert.equal((await h.ctx.stableCrawlViewport({},h.host))[0],row);assert.equal(h.waits(),2);
});
test('permanent empty or malformed middle viewport retains partial coverage and stops',async()=>{
 const h=env([[],[{valid:false}],[]]);
 await assert.rejects(h.ctx.stableCrawlViewport({},h.host),/partial coverage retained/);
 assert.equal(h.waits(),2);
});
test('wrong folder or disconnected viewport never returns rows',async()=>{
 const h=env([[{valid:true}]],{same:false});
 await assert.rejects(h.ctx.stableCrawlViewport({},h.host),/folder changed/);
 const x=env([[{valid:true}]]);x.host.isConnected=false;
 await assert.rejects(x.ctx.stableCrawlViewport({},x.host),/replaced/);
});


test('persistent blank viewport reanchors only backward then to original cursor, recovering real rows',async()=>{
 const row={valid:true,id:'actual'};const h=env([[],[],[],[row]]);let top=500;const moves=[];Object.defineProperty(h.host,'scrollTop',{get:()=>top,set:v=>{top=v;moves.push(v)}});
 assert.equal((await h.ctx.stableCrawlViewport({},h.host))[0],row);assert.deepEqual(moves,[430,500]);
});
test('unrecoverable blank viewport retains original cursor, never skips forward',async()=>{
 const h=env([[]]);h.host.scrollTop=500;await assert.rejects(h.ctx.stableCrawlViewport({},h.host),/partial coverage retained/);assert.equal(h.host.scrollTop,500);
});
test('blank resume can reset only an exact unique native scroll host for existing checkpoint',async()=>{
 const h=env([],{hosts:'one'});h.host.scrollTop=500;assert.equal(await h.ctx.recoverEmptyResumeViewport({seen:['id']}),true);assert.equal(h.host.scrollTop,0);
 const x=env([],{hosts:'ambiguous'});x.host.scrollTop=500;assert.equal(await x.ctx.recoverEmptyResumeViewport({seen:['id']}),false);assert.equal(x.host.scrollTop,500);
});
