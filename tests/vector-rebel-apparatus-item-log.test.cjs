'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
process.env.TZ='America/Chicago';
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    async function apparatusReadVerifiedHistory(item) {');
const b=src.indexOf('    function apparatusBuildReport(run) {',a);
assert.ok(a>0&&b>a);
const code=src.slice(a,b)+'\nreturn apparatusReadVerifiedHistory;';
const item={name:'AP-04',scope:'truck504',
 href:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/12/item'};
const makeRow=(text,raw)=>({text,raw});
function harness(pages,{identity=true}={}){
 let page=0,ms=0;
 class FakeDate extends Date{static now(){ms+=250;return ms;}}
 const next={click(){page++;}};
 const table=()=>({
  rows:pages[page],
  fingerprint:'page-'+page+'|'+pages[page].map(row=>row.text).join('|'),
  next:page<pages.length-1?next:null
 });
 const localDate=stamp=>{
  const d=new Date(stamp);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+
      String(d.getDate()).padStart(2,'0');
 };
 const shift=(stamp,raw)=>localDate(stamp -
   (/\b\d{1,2}:\d{2}\b/.test(raw)?7*3600000:0));
 const fn=new Function('apparatusVerifiedItemPage','ensureItemLogTabActive',
  'apparatusNativeHistoryPage','rowLooksLikeCompletedModeEntry',
  'SCBA_FRAME_INSPECTION_TITLE','historyRowAudit','itemLogRowText',
  'parseVectorHistoryDate','apparatusShiftDate','paginationControlEnabled',
  'Date','sleep',code)(
   ()=>identity,async()=>true,table,
   row=>/\bcomplete(?:d)?\b/i.test(row.text) && !/\bincomplete\b/i.test(row.text) &&
       row.text.includes('SCBA Inspection'),
   'SCBA Inspection',
   row=>({firstCell:row.raw,parsedAt:Date.parse(row.raw)}),
   row=>row.text,raw=>Date.parse(raw),shift,
   next=>next===table().next && page<pages.length-1,
   FakeDate,async()=>{}
  );
 return fn;
}
test('Reads native COMPLETE SCBA rows and ignores incomplete/unrelated inspections',async()=>{
 const rows=[
  makeRow('11/09/2026 10:30 AM SCBA Inspection COMPLETE','11/09/2026 10:30 AM'),
  makeRow('11/09/2026 11:00 AM SCBA Inspection INCOMPLETE','11/09/2026 11:00 AM'),
  makeRow('11/09/2026 12:00 PM Another Inspection COMPLETE','11/09/2026 12:00 PM')
 ];
 const result=await harness([rows])(item);
 assert.equal(result.readable,true);
 assert.equal(result.exhaustive,true);
 assert.equal(result.completedRows,1);
 assert.deepEqual(result.dates,['2026-11-09']);
});
test('Follows paginated item logs without treating first page as exhaustive',async()=>{
 const rows=[
  [makeRow('11/09/2026 10:30 AM SCBA Inspection COMPLETE','11/09/2026 10:30 AM')],
  [makeRow('11/03/2026 11:00 AM SCBA Inspection COMPLETE','11/03/2026 11:00 AM')]
 ];
 const result=await harness(rows)(item);
 assert.equal(result.exhaustive,true);
 assert.equal(result.pages,2);
 assert.deepEqual(result.dates,['2026-11-09','2026-11-03']);
});
test('Ten visible Item Log rows with no Next control are marked coverage uncertain',async()=>{
 const rows=Array.from({length:10},(_,i)=>makeRow(
  '11/09/2026 10:'+String(i).padStart(2,'0')+' AM SCBA Inspection COMPLETE',
  '11/09/2026 10:'+String(i).padStart(2,'0')+' AM'));
 const result=await harness([rows])(item);
 assert.equal(result.exhaustive,false);
 assert.equal(result.completedRows,10);
});
test('Cannot scan Item Log for a different asset identity',async()=>{
 await assert.rejects(harness([[]],{identity:false})(item),/identity was not confirmed/);
});
