'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    async function readCaptainComplianceHistory(item) {');
const b=src.indexOf('    function buildCaptainDailyReport(check)',a);
assert.ok(a>0&&b>a);
const code=src.slice(a,b)+'\nreturn readCaptainComplianceHistory;';
function harness({recovered='BALDREE-3290326-BU',accepted=true}={}){
 const calls=[];
 const run=new Function('getMode','isAssetPageFor','resolveClippedPpeNameFromVerifiedDetail',
  'verifyExpectedAssetPage','revealAssetHistory','readModeCompletionHistory',
  'SCBA_FACE_MASK_POOL',code)(
  mode=>({title:mode+' mode',short:mode,templates:{299900:'T1'}}),
  ()=>true,
  ()=>recovered,
  async item=>{calls.push(['verify',item.assetId]);return accepted},
  async(item,title)=>{calls.push(['reveal',item.assetId,title])},
  async(item,mode)=>{calls.push(['read',item.assetId,mode]);return {mode,dates:[]}},
  '9999'
 );
 return {run,calls};
}
test('Daily Captain read-only audit handles a list-clipped Hood PPE Name with verified exact heading and serial',async()=>{
 const h=harness(),item={assetId:'BALDREE-3290326-BU...',pool:'299900',itemId:'4599982',type:'Hood'};
 const results=await h.run(item);
 assert.deepEqual(Object.keys(results),['captain','tour']);
 assert.deepEqual(h.calls.map(x=>x[1]),[
  'BALDREE-3290326-BU','BALDREE-3290326-BU','BALDREE-3290326-BU','BALDREE-3290326-BU'
 ]);
 assert.equal(item.assetId,'BALDREE-3290326-BU...','audit matching key must remain unchanged');
});
test('Daily Captain audit does not bypass failed identity proof',async()=>{
 const h=harness({accepted:false});
 await assert.rejects(()=>h.run({assetId:'BALDREE-3290326-BU...',pool:'299900',itemId:'4599982',type:'Hood'}),/identity could not be verified/);
 assert.equal(h.calls.length,1);
});
test('Captain audit without a clipped name continues strict original verification',async()=>{
 const h=harness({recovered:''}),item={assetId:'BALDREE-3290326-BU',pool:'299900',itemId:'4599982',type:'Hood'};
 await h.run(item);
 assert.ok(h.calls.every(c=>c[1]===item.assetId));
});
test('Audit repair is read-only and cannot change the PPE inventory or submit inspections',()=>{
 const audit=src.slice(a,b);
 assert.match(audit,/resolveClippedPpeNameFromVerifiedDetail/);
 assert.doesNotMatch(audit,/item\.assetId\s*=|Submit Inspection|\.click\(/);
});
