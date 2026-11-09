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
  for(const [name,status,hasLocation=true] of statuses){
    const card={
      innerText:name+(hasLocation?'\nLocation: T504\nAsset Tag: 1234':'\nRequirements: Physically inspect')+'\n'+status,
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
  assert.match(src,/const IQ_VERSION = '0\.1\.11'/);
  assert.match(src,/^\/\/ @version\s+0\.1\.11/m);
});

test('full 90-item T504 list includes 24 cards lacking location and tag metadata',()=>{
  const list=[];
  for(let i=0;i<52;i++) list.push(['Asset #'+i,'Not Verified',true]);
  for(let i=0;i<14;i++) list.push(['Verified Tool #'+i,'Verified',true]);
  for(let i=0;i<24;i++) list.push(['Equipment Requirement #'+i,'Not Verified',false]);
  const items=harness(list)();
  assert.equal(items.length,90);
  assert.equal(items.filter(x=>x.status==='not verified').length,76);
  assert.equal(items.filter(x=>x.status==='verified').length,14);
  assert.ok(items.some(x=>x.title==='Equipment Requirement #23'));
});
test('native T504 badges reconcile exactly to 90 total, 76 action, 14 complete, 16 maintenance due',()=>{
  const a=src.indexOf('  function readNativeAssetTotals() {');
  const b=src.indexOf('  function readAssetReviewRows() {',a);
  assert.ok(a>0&&b>a);
  const code=src.slice(a,b)+'\nreturn readNativeAssetTotals;';
  const makeBadge=text=>({innerText:text,closest:()=>null});
  const badges=[
    makeBadge('All Assets\n90'),
    makeBadge('Action Required\n76'),
    makeBadge('Completed\n14'),
    makeBadge('Maintenance Due\n16'),
    makeBadge('No Group\n90')
  ];
  const run=(rows,unit='60443')=>new Function('isAssetPage','inspectionId',
    'ASSET_UNIT_ID','t504Visible','document','visible',
    'PANEL','ASSET_GUIDE_ID','clean',code)(
      ()=>true,()=>unit,'60443',()=>true,
      {querySelectorAll:()=>rows},()=>true,
      'rebel-iq-t504-panel','rebel-iq-t504-asset-guide',clean
    );
  assert.deepEqual(run(badges)(),{total:90,required:76,completed:14,maintenance:16});
  assert.equal(run(badges.map(x=>x.innerText==='Completed\n14'
    ? makeBadge('Completed\n13') : x))(),null);
  assert.equal(run(badges,'99999')(),null);
});
test('unmatched asset coverage is visibly disclosed and native counts are authoritative',()=>{
  const block=src.slice(src.indexOf('  function refreshAssetReviewGuide() {'),
    src.indexOf('  function beginAssets() {'));
  assert.match(block,/readNativeAssetTotals\(\)/);
  assert.match(block,/not mapped: use the native list for these/);
  assert.match(block,/guide detects|Guide detects/);
  assert.match(block,/Maintenance Due/);
  assert.doesNotMatch(block,/\.click\(|\.checked\s*=|Submit Inspection/);
});
