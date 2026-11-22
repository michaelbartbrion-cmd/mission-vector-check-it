'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    async function readModeCompletionHistory(item, modeKey) {');
const b=src.indexOf('    async function readCaptainComplianceHistory(item)',a);
assert.ok(a>0&&b>a,'Real mode-history function not found for test');
function harness(pages,{wrongAsset=false,unchanged=false,emptyPaginator=false}={}){
 let page=0,clicked=0,asset=1;const item={assetId:'FOX-COAT-01'};
 const context={
  Date,Math,Object,Set,Error,
  getMode:key=>key==='tour'?{title:'Routine PPE',short:'Tour'}:null,
  isAssetPageFor:()=>!wrongAsset||asset===1,
  assetPageContainsExpectedId:()=>!wrongAsset||asset===1,
  waitForItemLogSnapshotSettled:async()=>({count:pages[page].length}),
  itemLogCompletedRowSource:()=>({rows:pages[page],parserPath:'verified-native-item-log'}),
  findItemLogHistoryTable:()=>null,
  historyRows:()=>pages[page],
  itemLogRowText:row=>row.text,
  diagnosticTextHash:x=>x,
  historyEntriesFromSource:x=>x.rows.map(r=>r.date?{date:r.date}:null)
       .filter(Boolean).map(x=>x.date),
  nativeCompletedVerdictsFromSource:x=>Object.fromEntries(x.rows
    .filter(y=>y.date).map(y=>[y.date,y.verdict||'unknown'])),
  getPaginationControl:()=> page+1<pages.length||emptyPaginator?
    {click(){clicked++;if(!unchanged)page=Math.min(page+1,pages.length-1);
      if(wrongAsset)asset=0;}}:null,
  paginationControlEnabled:x=>!!x,
  sleep:async()=>{if(unchanged)throw Error('Next never updated page')},
 };
 vm.createContext(context);
 vm.runInContext(src.slice(a,b),context);
 return{context,item,getPage:()=>page,getClicked:()=>clicked};
}
test('reads actual October and November from separate native Item Log pages',async()=>{
 const h=harness([
   [{date:'2026-11-21',text:'11/21/2026 PASSED',verdict:'passed'},
    {date:'2026-11-15',text:'11/15/2026 COMPLETE',verdict:'unknown'}],
   [{date:'2026-10-27',text:'10/27/2026 FAILED',verdict:'failed'},
    {date:'2026-10-22',text:'10/22/2026 COMPLETE',verdict:'unknown'}]
 ]);
 const result=await h.context.readModeCompletionHistory(h.item,'tour');
 assert.equal(result.pages,2);
 assert.equal(h.getClicked(),1,'read-only next page exactly once');
 assert.deepEqual([...result.dates],['2026-11-21','2026-11-15','2026-10-27','2026-10-22']);
 assert.equal(result.verdicts['2026-11-21'],'passed');
 assert.equal(result.verdicts['2026-10-27'],'failed');
 assert.equal(result.verdicts['2026-11-15'],'unknown');
 assert.equal(result.completedRowCount,4);
});
test('same-day conflict across native pages never falsely certifies PASS',async()=>{
 const h=harness([
  [{date:'2026-11-21',text:'Nov21 passed one',verdict:'passed'}],
  [{date:'2026-11-21',text:'Nov21 result not provided second',verdict:'unknown'},
   {date:'2026-10-22',text:'Oct22 explicit failed',verdict:'failed'}]
 ]);
 const result=await h.context.readModeCompletionHistory(h.item,'tour');
 assert.equal(result.verdicts['2026-11-21'],'unknown');
 assert.equal(result.verdicts['2026-10-22'],'failed');
 assert.equal(result.pages,2);
});
test('never calls native history Next on already-complete single short page',async()=>{
 const h=harness([[{date:'2026-11-21',text:'nov record'}]]);
 const result=await h.context.readModeCompletionHistory(h.item,'tour');
 assert.equal(h.getClicked(),0);assert.equal(result.pages,1);
 assert.equal(result.exhaustive,true);
});
test('unrecognized full ten-row history page is never called exhaustive',async()=>{
 const rows=Array.from({length:10},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),
   text:'Row '+i}));
 const h=harness([rows]);
 const result=await h.context.readModeCompletionHistory(h.item,'tour');
 assert.equal(result.exhaustive,false);
 assert.equal(result.dates.length,10);
});
test('abort immediately if native detail ownership changes during pagination',async()=>{
 const h=harness([[{date:'2026-11-21',text:'p0'}],[{date:'2026-10-21',text:'p1'}]],
  {wrongAsset:true});
 await assert.rejects(()=>h.context.readModeCompletionHistory(h.item,'tour'),
  /changed native asset/);
});
test('unresponsive Next stops rather than misreporting a two-month history',async()=>{
 const h=harness([[{date:'2026-11-21',text:'p0'}],[{date:'2026-10-21',text:'p1'}]],
  {unchanged:true});
 await assert.rejects(()=>h.context.readModeCompletionHistory(h.item,'tour'),
  /Next never updated page|Next did not change/);
});
