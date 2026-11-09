'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const start=src.indexOf('  function readAssetReviewRows() {');
const end=src.indexOf('  function findNativeAssetTagEntry() {',start);
assert.ok(start>0&&end>start,'read-only asset status parser found');
const source=src.slice(start,end)+'\nreturn readAssetReviewRows;';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
function harness(statuses,{onT504=true,onAssetPage=true}={}){
  const labels=[];
  for(const [name,status,hasLocation=true,maintenanceText='',hasIcon=false,par=null] of statuses){
    const card={
      innerText:name+(hasLocation?'\nLocation: T504\nAsset Tag: 1234':'\nRequirements: Physically inspect')+ (par?'\nPAR:\n'+par:'')+ (maintenanceText ? '\nMaintenance Due: '+maintenanceText : '')+'\n'+status,
      getBoundingClientRect:()=>({height:58}),
      contains:node=>node===label,
      parentElement:null
    };
    const label={
      textContent:status,children:hasIcon?[{textContent:''}]:[],
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
test('status chips containing icons are still recognized as Not Verified',()=>{
  const rows=harness([
    ['Cardiac Monitor','Not Verified',true,'',true],
    ['SCBA Frame','Verified',true,'',true]
  ])();
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(row=>row.status),['not verified','verified']);
});
test('other units or non-asset pages never expose an asset review',()=>{
  assert.deepEqual(harness([['Some Gear','Not Verified']],{onT504:false})(),[]);
  assert.deepEqual(harness([['Some Gear','Not Verified']],{onAssetPage:false})(),[]);
});
test('asset guide reads native statuses; inspection batch requires attended action',()=>{
  const block=src.slice(start,src.indexOf('  function findNativeAssetTagEntry() {',start));
  assert.match(block,/Refresh Unverified List/);
  assert.match(block,/Record Verified Assets/);
  assert.match(block,/data-asset-check-attest/);
  assert.doesNotMatch(block,/\.click\(|\.dispatchEvent\(|fetch\(|GM_xmlhttpRequest\(|Submit Inspection/);
});
test('asset review is independent from Daily Tour',()=>{
  assert.match(src,/button\('Daily Tour', 'daily'\)/);
  assert.match(src,/button\('Assets', 'assets'\)/);
  assert.match(src,/openAssetReviewScreen\(\)/);
  assert.match(src,/const IQ_VERSION = '0\.1\.20'/);
  assert.match(src,/^\/\/ @version\s+0\.1\.20/m);
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
    src.indexOf('  function findNativeAssetTagEntry() {'));
  assert.match(block,/readNativeAssetTotals\(\)/);
  assert.match(block,/Incomplete:/);
  assert.match(block,/Complete:/);
  assert.doesNotMatch(block,/Maintenance Due/);
  assert.doesNotMatch(block,/\.click\(|Submit Inspection/);
});

test('asset checklist defaults to verified draft and permits exceptions before a human record action',()=>{
  const section=src.slice(src.indexOf('  function makeAssetReviewScreen() {'),
    src.indexOf('  function beginAssets() {'));
  assert.match(section,/Refresh Unverified List/);
  assert.match(section,/Record Verified Assets/);
  assert.match(section,/\['verified','Verified'\]/);
  assert.match(section,/\['missing','Missing'\]/);
  assert.match(section,/\['not_working','Not Working'\]/);
  assert.match(section,/\['damaged','Damaged'\]/);
  assert.match(section,/\['skip','Skip'\]/);
  assert.match(section,/data-asset-check-attest/);
  assert.match(section,/attest\.checked/);
  assert.match(section,/native\.button\.click\(\)/);
  assert.match(section,/actual\[0\]\.status==='verified'/);
  assert.doesNotMatch(section,/window\.confirm\(/);
  assert.doesNotMatch(section,/GM_xmlhttpRequest\(|\bfetch\(|\.submit\(/);
});

test('maintenance-due dates do not change asset inspection eligibility',()=>{
  const at = date => [date.getMonth()+1,date.getDate(),date.getFullYear()]
    .map((value,i)=>i<2?String(value).padStart(2,'0'):String(value))
    .join('/');
  const earlier = new Date(); earlier.setDate(earlier.getDate()-2);
  const later = new Date(); later.setDate(later.getDate()+40);
  const rows=harness([
    ['Due Maintenance','Not Verified',true,at(earlier)],
    ['Not Yet Due','Not Verified',true,at(later)],
    ['No Date','Not Verified',true,'unparseable']
  ])();
  assert.ok(rows.every(row => row.status === 'not verified'));
  assert.ok(rows.every(row => !('maintenanceBlocked' in row)));
  assert.deepEqual(rows.map(row => row.title), ['Due Maintenance','Not Yet Due','No Date']);
});

test('real native Paratech PAR quantities explain all 24 extra units, not missing assets',()=>{
  const pars=[6,4,3,3,2,2,2,4,2,2,2,4];
  const catalogue=pars.map((par,i)=>['Paratech '+i,'Not Verified',false,'',false,par]);
  const ordinary=Array.from({length:40},(_,i)=>['Tag '+i,'Not Verified']);
  const completed=Array.from({length:14},(_,i)=>['Complete '+i,'Verified']);
  const rows=harness([...catalogue,...ordinary,...completed])();
  assert.equal(rows.length,66,'one visible card per kind of asset');
  assert.equal(rows.reduce((sum,row)=>sum+row.quantity,0),90);
  assert.equal(rows.filter(row=>row.status==='not verified')
    .reduce((sum,row)=>sum+row.quantity,0),76);
  assert.equal(rows.filter(row=>row.status==='verified').length,14);
  assert.equal(rows.filter(row=>row.quantity>1).length,12);
  assert.equal(rows.reduce((sum,row)=>sum+row.quantity-1,0),24);
});
