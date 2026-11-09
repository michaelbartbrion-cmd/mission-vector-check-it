'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const begin = src.indexOf('  function findNativeAssetTagEntry() {');
const end = src.indexOf('  function beginAssets() {',begin);
assert.ok(begin>0 && end>begin,'attended verification methods exist');
const functions = src.slice(begin,end);
const clean = x => String(x ?? '').replace(/\s+/g,' ').trim();
class MockInput {
  constructor() {
    this._value = '';
    this.disabled = false;
    this.readOnly = false;
    this.isConnected = true;
  }
  get value(){return this._value;}
  set value(value){this._value=String(value);}
  getAttribute(key){
    return key === 'placeholder' ? 'Enter Asset Tag / Serial #' : '';
  }
  closest(){return null;}
  getBoundingClientRect(){return {left:100,right:260,top:100,bottom:130};}
  focus(){this.focused=true;}
  dispatchEvent(){return true;}
}
function scenario(options={}) {
  const input=new MockInput();
  if(options.inputValue) input.value=options.inputValue;
  const row={title:'Thermal Imager',assetTag:'213',
    status:'not verified'};
  const rows=[row];
  if(options.duplicate) rows.push({title:'Another asset',assetTag:'213',status:'not verified'});
  const status={textContent:''},record={disabled:false};
  const presence={checked:options.accept!==false,disabled:false};
  const section={querySelector(sel){
    return sel==='[data-asset-guide-status]'?status:
      sel==='[data-asset-guide-record]'?record:
      sel==='[data-asset-guide-confirm]'?presence:null;
  }};
  let clicks=0;
  const button={
    type:'button',disabled:false,isConnected:true,textContent:'',
    getAttribute:()=>'',getBoundingClientRect:()=>({left:263,right:300,top:100,bottom:130}),
    click(){clicks++; if(options.complete)row.status='verified';}
  };
  const container={parentElement:null,querySelectorAll:()=>[button]};
  input.parentElement=container;
  const doc={
    querySelectorAll(name){return name==='input'? (options.noInput?[]:[input]) : [];},
    getElementById(){return section;}
  };
  const code='let selectedAssetReview={title:"Thermal Imager",assetTag:"213"},'+
    'assetRecordBusy=false,assetGuideNext=0,assetGuideLastScan=0;'+
    'const attemptedAssetRecords=new Set();\n'+functions+
    '\nreturn {recordSelectedAssetPresence,findNativeAssetTagEntry,'+
    'selectOnePendingAssetByTag,setSelection:x=>{selectedAssetReview=x},'+
    'attemptedAssetRecords};';
  const fakeEvent=class Event {constructor(type){this.type=type;}};
  const create=new Function('isAssetPage','inspectionId','ASSET_UNIT_ID',
    't504Visible','document','visible','PANEL','ASSET_GUIDE_ID','clean',
    'readAssetReviewRows','readPending','readRopes','location',
    'window','HTMLInputElement','Event','setTimeout','refreshAssetReviewGuide',code);
  const app=create(()=>!options.wrongRoute,()=>options.wrongUnit?'99999':'60443',
    '60443',()=>true,doc,()=>true,'rebel-iq-t504-panel',
    'rebel-iq-t504-asset-guide',clean,()=>rows,
    ()=>options.pending?{}:null,()=>null,{pathname:'/inspections/60443/assets/group/-1'},
    {},
    MockInput,fakeEvent,cb=>cb(),()=>{});
  return {app,input,status,record,presence,row,rows,clicks:()=>clicks};
}
test('one physically confirmed exact asset tag is handed to native Operative IQ once',async()=>{
  const h=scenario({complete:true});
  await h.app.recordSelectedAssetPresence();
  assert.equal(h.clicks(),1);
  assert.equal(h.input.value,'213');
  assert.equal(h.row.status,'verified');
  assert.match(h.status.textContent,/Operative IQ confirms VERIFIED/);
  assert.equal(h.record.disabled,true);
  assert.equal(h.presence.checked,false,'confirmation is single-use');
});
test('unchecked in-panel physical confirmation never touches the native asset field',async()=>{
  const h=scenario({accept:false});
  await h.app.recordSelectedAssetPresence();
  assert.equal(h.clicks(),0);
  assert.equal(h.input.value,'');
});
test('missing or duplicate tags reject native verification',async()=>{
  const a=scenario({duplicate:true});
  await a.app.recordSelectedAssetPresence();
  assert.equal(a.clicks(),0);
  const b=scenario({noInput:true});
  await b.app.recordSelectedAssetPresence();
  assert.equal(b.clicks(),0);
  const c=scenario({inputValue:'OTHER'});
  await c.app.recordSelectedAssetPresence();
  assert.equal(c.clicks(),0);
  assert.equal(c.input.value,'OTHER');
});
test('wrong unit/route and active draft fail closed',async()=>{
  for(const x of [{wrongUnit:true},{wrongRoute:true},{pending:true}]){
    const h=scenario(x);
    await h.app.recordSelectedAssetPresence();
    assert.equal(h.clicks(),0,JSON.stringify(x));
    }
});
test('non-confirmed native outcome never claims verification, cannot auto retry',async()=>{
  const h=scenario({complete:false});
  await h.app.recordSelectedAssetPresence();
  assert.equal(h.clicks(),1);
  assert.match(h.status.textContent,/Verification not confirmed/);
  h.app.setSelection({title:'Thermal Imager',assetTag:'213'});
  h.presence.checked = true;
  h.presence.disabled = false;
  await h.app.recordSelectedAssetPresence();
  assert.equal(h.clicks(),1);
  assert.match(h.status.textContent,/already attempted/);
});
test('the only native click requires physical confirmation, a unique tag and exact T504 route',()=>{
  assert.match(functions,/checkbox\.checked/);
  assert.doesNotMatch(functions,/window\.confirm\(/);
  assert.match(functions,/selectOnePendingAssetByTag\(assetTag,title\)/);
  assert.match(functions,/const currentNative = findNativeAssetTagEntry\(\)/);
  assert.match(functions,/attemptedAssetRecords\.add\(key\)/);
  assert.match(functions,/native\.button\.click\(\)/);
  assert.doesNotMatch(functions,/GM_xmlhttpRequest\(|\bfetch\(|\.submit\(/);
  assert.match(src,/button\('Daily Tour \+ Assets', 'daily'\)/);
  assert.match(src,/^\/\/ @version\s+0\.1\.14/m);
});
