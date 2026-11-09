'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const start=src.indexOf('  async function scanAllNativeAssetRows() {');
const end=src.indexOf('  function makeAssetReviewScreen() {',start);
assert.ok(start>0&&end>start,'full native scroll scanner present');
const code=src.slice(start,end)+'\nreturn scanAllNativeAssetRows;';
const makeRow=(i,status)=>({
  title:'Equipment '+i,assetTag:'TAG'+i,status,
  element:{innerText:'Equipment '+i}
});
test('all 76 pending assets are collected from 52 initial and 24 lower virtual scroll rows',async()=>{
  const first=Array.from({length:52},(_,i)=>makeRow(i,'not verified'));
  const complete=Array.from({length:14},(_,i)=>makeRow(100+i,'verified'));
  const later=Array.from({length:24},(_,i)=>makeRow(52+i,'not verified'));
  const root={scrollHeight:4100,clientHeight:800,scrollTop:65};
  const scans=[];
  const readRows=()=>{
    scans.push(root.scrollTop);
    return root.scrollTop>=1850 ? [...later,...complete] : [...first,...complete];
  };
  const run=new Function('isAssetPage','inspectionId','ASSET_UNIT_ID',
    't504Visible','document','readAssetReviewRows','clean','setTimeout','readNativeAssetTotals','visible','getComputedStyle','PANEL','ASSET_GUIDE_ID',code)(
      ()=>true,()=> '60443','60443',()=>true,{scrollingElement:root,querySelectorAll:()=>[]},readRows,
      x=>String(x??'').replace(/\s+/g,' ').trim(),cb=>cb(),()=>({total:90,required:76}),()=>true,()=>({overflowY:'auto'}),'rebel-iq-t504-panel','rebel-iq-t504-asset-guide'
    );
  const all=await run();
  assert.equal(all.length,90);
  assert.equal(all.filter(x=>x.status==='not verified').length,76);
  assert.equal(all.filter(x=>x.status==='verified').length,14);
  assert.equal(root.scrollTop,65,'restore inspector scroll position');
  assert.ok(scans.some(x=>x>1850),'reads lower rows rather than only viewport');
});
test('no scan is attempted off T504 Asset Requirements route',async()=>{
  const run=new Function('isAssetPage','inspectionId','ASSET_UNIT_ID',
    't504Visible','document','readAssetReviewRows','clean','setTimeout',code)(
      ()=>false,()=> '60443','60443',()=>true,
      {scrollingElement:{scrollHeight:4000,clientHeight:800,scrollTop:0},querySelectorAll:()=>[]},
      ()=>{throw Error('should never read off-route')},
      x=>String(x??'').trim(),cb=>cb(),()=>({total:90,required:76}),()=>true,()=>({overflowY:'auto'}),'rebel-iq-t504-panel','rebel-iq-t504-asset-guide'
    );
  assert.deepEqual(await run(),[]);
});
test('unscannable native page degrades to currently visible rows without claiming full completion',async()=>{
  const single=makeRow(1,'not verified');
  const run=new Function('isAssetPage','inspectionId','ASSET_UNIT_ID',
    't504Visible','document','readAssetReviewRows','clean','setTimeout',code)(
      ()=>true,()=> '60443','60443',()=>true,
      {querySelectorAll:()=>[]},()=>[single],x=>String(x??'').trim(),cb=>cb()
    );
  assert.equal((await run()).length,1);
  assert.match(src,/not loaded or not identifiable/);
});
test('the Assets button opens one full-screen overlay while Daily Tour stays independent',()=>{
  assert.match(src,/button\('Daily Tour', 'daily'\)/);
  assert.match(src,/button\('Assets', 'assets'\)/);
  assert.match(src,/document\.body\.append\(root, makeAssetReviewScreen\(\)\)/);
  assert.match(src,/screen\.style\.display='block'/);
  assert.match(src,/screen\.style\.display='none'/);
  assert.match(src,/position:fixed;inset:0/);
  assert.doesNotMatch(src,/Daily Tour \+ Assets|readAssetFollowup/);
  assert.match(src,/^\/\/ @version\s+0\.1\.18/m);
});
