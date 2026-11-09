'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const start=src.indexOf('  function readAssetReviewRows() {');
const end=src.indexOf('  function showNextAssetToReview() {',start);
assert.ok(start>0&&end>start,'read-only asset status parser found');
const source=src.slice(start,end)+'\nreturn readAssetReviewRows;';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
function harness(statuses,{onT504=true,onAssetPage=true}={}){
  const labels=[];
  for(const [name,status] of statuses){
    const card={
      innerText:name+'\nLocation: T504\nAsset Tag: 1234\n'+status,
      getBoundingClientRect:()=>({height:58}),
      contains:node=>node===label,
      parentElement:null
    };
    const label={
      textContent:status,children:[],
      closest:()=>null,parentElement:card
    };
    labels.push(label);
  }
  const doc={querySelectorAll:()=>labels};
  return new Function('isAssetPage','inspectionId','ASSET_UNIT_ID','t504Visible',
    'document','visible','PANEL','ASSET_GUIDE_ID','clean',source)(
    ()=>onAssetPage,()=>onT504?'60443':'99999','60443',()=>onT504,
    doc,()=>true,'rebel-iq-t504-panel','rebel-iq-t504-asset-guide',clean
  );
}
test('T504 asset guide reads statuses without changing them',()=>{
  const source=[
    ['Thermal Imager','Not Verified'],['SCBA Facepiece','Verified'],
    ['Saw','Needs Attention']
  ];
  const read=harness(source);
  const rows=read();
  assert.deepEqual(rows.map(r=>r.title),source.map(x=>x[0]));
  assert.deepEqual(rows.map(r=>r.status),[
    'not verified','verified','needs attention']);
});
test('other units or non-asset pages never expose an asset review',()=>{
  assert.deepEqual(harness([['Some Gear','Not Verified']],{onT504:false})(),[]);
  assert.deepEqual(harness([['Some Gear','Not Verified']],{onAssetPage:false})(),[]);
});
test('asset guide scrolls to the next item but does not certify any equipment',()=>{
  const block=src.slice(start,src.indexOf('  function beginAssets() {',start));
  assert.match(block,/scrollIntoView\(\{behavior: 'smooth', block: 'center'\}\)/);
  assert.match(block,/Next Unverified/);
  assert.match(block,/No asset has been marked checked|no status is changed automatically/i);
  assert.doesNotMatch(block,/\.click\(|\.checked\s*=|\.dispatchEvent\(|fetch\(|GM_xmlhttpRequest\(|Submit Inspection/);
});
test('asset review remains a separate phase after confirmed saved Tour draft',()=>{
  assert.match(src,/Daily Tour \+ Assets/);
  assert.match(src,/Asset Checks/);
  assert.match(src,/const assetFollowup = readAssetFollowup\(\)/);
  assert.match(src,/location\.assign\(assetUrl\(followup\.unitId\)\)/);
  assert.match(src,/const IQ_VERSION = '0\.1\.10'/);
  assert.match(src,/^\/\/ @version\s+0\.1\.10/m);
});
