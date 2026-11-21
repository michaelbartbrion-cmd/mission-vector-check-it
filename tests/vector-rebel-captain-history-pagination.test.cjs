'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    function captainNativeHistoryPage(item,modeTitle){');
const b=src.indexOf('    async function readCaptainComplianceHistory(item) {',a);
assert.ok(a>0&&b>a,'read-only native Item Log pagination reader exists');
const reader=src.slice(a,b)+'\nreturn readModeCompletionHistory;';
const item={assetId:'PPE-COAT-001'},row=(date,label='Tour Check COMPLETE')=>
 ({text:date+' '+label,date:Date.parse(date+'T12:00:00Z')});
function harness(pages,{stall=false,structural=false}={}){
 let page=0,stamp=0;
 class Clock extends Date{static now(){stamp+=350;return stamp;}}
 const next={click(){if(!stall)page++;}};
 const raw=()=>pages[page]||[];
 const fmt=ms=>Number.isFinite(ms)?new Date(ms).toISOString().slice(0,10):'';
 const mock={
  isAssetPageFor:()=>true,assetPageContainsExpectedId:()=>true,
  itemLogCompletedRowSource:()=>({rows:raw().filter(r=>/\bCOMPLETE\b/.test(r.text)&&
   !/\bINCOMPLETE\b/.test(r.text)),parserPath:structural?'structural':'semantic-container'}),
  findItemLogHistoryTable:()=>({id:'Item Log'}),
  historyRows:()=>raw(),structuralItemLogRows:()=>[],
  diagnosticTextHash:x=>x,
  itemLogRowText:x=>x.text,
  getPaginationControl:()=>page<pages.length-1?next:undefined,
  getMode:()=>({title:'Tour Inspection',short:'Tour'}),
  waitForItemLogSnapshotSettled:async()=>({fingerprint:'stable'}),
  historyRowAudit:r=>({parsedAt:r.date,firstCell:fmt(r.date)}),
  parseVectorHistoryDate:s=>Date.parse(s),
  localHistoryDateKey:fmt,
  historyEntriesFromSource:source=>[...new Set(source.rows
   .map(r=>fmt(r.date)).filter(Boolean))],
  paginationControlEnabled:control=>!!control&&page<pages.length-1,
  sleep:async()=>{},
  Date:Clock
 };
 const names=Object.keys(mock);
 const fn=new Function(...names,reader)(...names.map(n=>mock[n]));
 return{run:()=>fn(item,'tour'),where:()=>page};
}
test('full PPE Item Log audit combines native completed checks from multiple pages',async()=>{
 const r=await harness([
  [row('2026-11-15'),row('2026-11-09','Other Check INCOMPLETE')],
  [row('2026-11-03'),row('2026-10-28')]
 ]).run();
 assert.equal(r.exhaustive,true);
 assert.equal(r.pages,2);
 assert.deepEqual(r.dates,['2026-11-15','2026-11-03','2026-10-28']);
 assert.equal(r.completedRowCount,3);
});
test('ten visible rows without authoritative next control are partial coverage',async()=>{
 const ten=Array.from({length:10},(_,i)=>row('2026-11-'+String(i+1).padStart(2,'0')));
 const result=await harness([ten]).run();
 assert.equal(result.pages,1);
 assert.equal(result.exhaustive,false);
 assert.equal(result.dates.length,10);
});
test('one short native Item Log page can establish complete coverage',async()=>{
 const result=await harness([[row('2026-10-07')]]).run();
 assert.equal(result.exhaustive,true);
 assert.deepEqual(result.dates,['2026-10-07']);
});
test('structural-only matching rows without native last-page proof have unknown coverage',async()=>{
 const result=await harness([[row('2026-10-07')]],{structural:true}).run();
 assert.equal(result.exhaustive,false);
 assert.deepEqual(result.dates,['2026-10-07']);
});
test('native next-page button with no page change stops without false completion',async()=>{
 const h=harness([[row('2026-11-15')],[row('2026-10-07')]],{stall:true});
 await assert.rejects(h.run(),/next page did not change/);
 assert.equal(h.where(),0);
});
test('a completed native inspection with unreadable date stops, not omitted as a miss',async()=>{
 const bad={text:'? Tour Check COMPLETE',date:NaN};
 await assert.rejects(harness([[bad]]).run(),/date unreadable/);
});
test('read-only history audit is bounded and never starts native inspections',()=>{
 assert.doesNotMatch(reader,/submit|saveNative|completeInspection|startInspection/i);
 assert.match(reader,/pageIndex<30/);
 assert.match(reader,/next\.click\(\); \/\/ Read-only native Item Log/);
});
