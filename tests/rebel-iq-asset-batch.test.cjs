'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const start=src.indexOf('  function buildAssetBatchPlan(rawExceptions) {');
const end=src.indexOf('  function beginAssets() {',start);
assert.ok(start>0&&end>start,'guarded asset batch implementation is present');
const block=src.slice(start,end);
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();

class FakeInput {
  constructor(){this._value='';this.isConnected=true;this.disabled=false;this.readOnly=false;}
  get value(){return this._value;}
  set value(value){this._value=String(value);}
  focus(){}
  dispatchEvent(){return true;}
}
function scenario(config={}) {
  const rows=(config.rows||[
    ['Thermal Imager','213','not verified',false],
    ['SCBA Frame','EFS-2001','not verified',true],
    ['Cardiac Monitor','CM2328','not verified',false],
    ['Duplicate 1','DUP','not verified',false],
    ['Duplicate 2','DUP','not verified',false],
    ['Saw','','not verified',false],
    ['Thermal Imager','394','verified',false],
    ['Safety Line','555','not verified',false]
  ]).map(([title,assetTag,status,maintenanceBlocked])=>
    ({title,assetTag,status,maintenanceBlocked}));
  const nodes=new Map(),set=(key,node)=>{nodes.set(key,node);return node;};
  const input=new FakeInput();
  const status={textContent:''},progress={textContent:''};
  const raw={value:config.exceptions||'CM2328'};
  const attest={checked:false,disabled:true};
  const action={disabled:true,textContent:''};
  const stop={disabled:true};
  const atttext={textContent:''},plan={textContent:'',
    append(node){this.node=node;}};
  const doc={
    createElement(tag){
      return {tag,style:{cssText:''},textContent:'',
        setAttribute(){},append(...n){this.children=n;},disabled:false};
    },
    getElementById(){return section}
  };
  set('[data-asset-batch-exceptions]',raw);
  set('[data-asset-batch-attest]',attest);
  set('[data-asset-batch-run]',action);
  set('[data-asset-batch-stop]',stop);
  set('[data-asset-batch-progress]',progress);
  set('[data-asset-batch-plan]',plan);
  set('[data-asset-batch-attest-text]',atttext);
  set('[data-asset-guide-status]',status);
  const section={querySelector:key=>nodes.get(key)||null};
  let clicks=0;
  const nativeButton={
    isConnected:true,
    click(){
      clicks++;
      if(config.update===false)return;
      const matching=rows.filter(row=>row.assetTag.toUpperCase()===input.value);
      if(matching.length===1)matching[0].status='verified';
    }
  };
  const native=()=>config.nativeUnavailable?null:{input,button:nativeButton};
  const counters=()=>config.nativeNull?null:({
    total:config.total||90,required:76,completed:14,maintenance:16
  });
  const js='let assetBatchPreview=null,assetBatchRunning=false,'+
    'assetRecordBusy=false,assetBatchCancel=false,'+
    'assetBatchPilotConfirmed=false,assetGuideLastScan=0;'+
    'const attemptedAssetRecords=new Set();\n'+block+'\n'+
    'return {buildAssetBatchPlan,prepareAssetBatchPreview,'+
    'runInspectedAssetBatch,invalidateAssetBatchPreview,'+
    'getPreview:()=>assetBatchPreview,'+
    'isPilotConfirmed:()=>assetBatchPilotConfirmed,'+
    'getAttempts:()=>attemptedAssetRecords};';
  const create=new Function('document','isAssetPage','inspectionId','ASSET_UNIT_ID',
    't504Visible','readPending','readRopes','readNativeAssetTotals',
    'readAssetReviewRows','clean','location','findNativeAssetTagEntry',
    'HTMLInputElement','Event','setTimeout','refreshAssetReviewGuide',
    'ASSET_GUIDE_ID',js);
  const fakeEvent=class {constructor(type){this.type=type;}};
  const app=create(doc,()=>config.wrongRoute!==true,
    ()=>config.wrongUnit?'9999':'60443','60443',
    ()=>true,()=>config.activeDraft?{}:null,()=>null,counters,()=>rows,clean,
    {pathname:'/inspections/60443/assets/group/-1'},native,FakeInput,
    fakeEvent,callback=>callback(),()=>{},'rebel-iq-t504-asset-guide');
  return {app,rows,raw,input,attest,action,plan,progress,
    clicks:()=>clicks};
}

test('batch plan excludes exceptions, maintenance due, no tags and duplicate tags',()=>{
  const {app}=scenario();
  const p=app.buildAssetBatchPlan('CM2328');
  assert.deepEqual(p.items.map(x=>x.assetTag),['213','555']);
  assert.equal(p.blocked.exception,1);
  assert.equal(p.blocked.maintenance,1);
  assert.equal(p.blocked.untagged,1);
  assert.equal(p.blocked.duplicate,2);
  assert.equal(p.blocked.otherStatus,1);
  assert.equal(p.unmapped,82);
  assert.equal(p.native.total,90);
});
test('mistyped exception, unavailable native totals, wrong unit and other draft stop all planning',()=>{
  assert.match(scenario().app.buildAssetBatchPlan('BADTAG').error,/not found/);
  assert.match(scenario({nativeNull:true}).app.buildAssetBatchPlan('').error,/Cannot reconcile/);
  assert.match(scenario({wrongUnit:true}).app.buildAssetBatchPlan('').error,/Open T504/);
  assert.match(scenario({activeDraft:true}).app.buildAssetBatchPlan('').error,/Finish existing/);
});
test('preview prepares a disclosed batch but cannot certify until physical attestation',async()=>{
  const h=scenario();
  h.app.prepareAssetBatchPreview();
  assert.equal(h.app.getPreview().items.length,2);
  assert.match(h.plan.textContent,/Safety pilot/);
  assert.match(h.plan.textContent,/not mapped/);
  assert.match(h.action.textContent,/Pilot/);
  assert.equal(h.attest.checked,false);
  assert.equal(h.action.disabled,true);
  await h.app.runInspectedAssetBatch();
  assert.equal(h.clicks(),0);
});
test('single-item field pilot verifies only one and requires another preview for remaining',async()=>{
  const h=scenario();
  h.app.prepareAssetBatchPreview();
  h.attest.checked=true;
  await h.app.runInspectedAssetBatch();
  assert.equal(h.clicks(),1);
  assert.equal(h.rows.find(row=>row.assetTag==='213').status,'verified');
  assert.equal(h.rows.find(row=>row.assetTag==='555').status,'not verified');
  assert.equal(h.app.isPilotConfirmed(),true);
  assert.match(h.progress.textContent,/Pilot confirmed/);
  h.app.prepareAssetBatchPreview();
  assert.equal(h.app.getPreview().items.length,1);
  assert.match(h.action.textContent,/Verify Inspected Assets \(1\)/);
  h.attest.checked=true;
  await h.app.runInspectedAssetBatch();
  assert.equal(h.clicks(),2);
  assert.equal(h.rows.find(row=>row.assetTag==='555').status,'verified');
  assert.match(h.progress.textContent,/Verified 1\/1/);
});
test('native verification uncertainty stops after one click and does not unlock bulk',async()=>{
  const h=scenario({update:false});
  h.app.prepareAssetBatchPreview();
  h.attest.checked=true;
  await h.app.runInspectedAssetBatch();
  assert.equal(h.clicks(),1);
  assert.equal(h.app.isPilotConfirmed(),false);
  assert.match(h.progress.textContent,/Official Verified status not confirmed/);
  assert.equal(h.rows.find(row=>row.assetTag==='213').status,'not verified');
  assert.equal(h.app.getAttempts().size,1);
});
test('exception change invalidates attestation and prevents mutation',async()=>{
  const h=scenario();
  h.app.prepareAssetBatchPreview();h.attest.checked=true;
  h.raw.value='213';h.app.invalidateAssetBatchPreview();
  assert.equal(h.attest.checked,false);
  await h.app.runInspectedAssetBatch();
  assert.equal(h.clicks(),0);
});
test('all asset writes are sequential native UI with exact receipt and abort on mismatch',()=>{
  assert.match(block,/native\.button\.click\(\)/);
  assert.match(block,/again\.length === 1 && again\[0\]\.title === item.title/);
  assert.match(block,/attemptedAssetRecords\.add\(key\)/);
  assert.match(block,/assetBatchPilotConfirmed \? plan\.items\.length : 1/);
  assert.match(block,/assetBatchCancel/);
  assert.match(block,/Date\.now\(\) - plan\.preparedAt > 10\*60\*1000/);
  assert.doesNotMatch(block,/\bfetch\(|GM_xmlhttpRequest\(|\.submit\(/);
  assert.match(src,/^\/\/ @version\s+0\.1\.14/m);
});
