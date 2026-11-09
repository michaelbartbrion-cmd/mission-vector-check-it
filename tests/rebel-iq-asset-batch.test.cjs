'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const begin=src.indexOf('  function buildReviewedAssetChecklist(rowsOverride) {');
const end=src.indexOf('  function beginAssets() {',begin);
assert.ok(begin>0&&end>begin,'Vector-style reviewed asset checklist present');
const logic=src.slice(begin,end);
const clean=x=>String(x??'').replace(/\s+/g,' ').trim();
class FakeInput {
  constructor(){this._value='';this.isConnected=true;this.disabled=false;this.readOnly=false;}
  get value(){return this._value;}
  set value(v){this._value=String(v);}
  focus(){}
  dispatchEvent(){return true;}
}
class MockElement {
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();this.children=[];this.style={cssText:''};
    this.checked=false;this.disabled=false;this.textContent='';this.value='';
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(k,v){this[k]=v;}
  querySelectorAll(selector){
    const matches=[];const tag=selector.toUpperCase();
    const visit=node=>{if(node.tagName===tag)matches.push(node);
      for(const child of node.children||[])visit(child);};
    for(const child of this.children)visit(child);
    return matches;
  }
}
function scenario(options={}){
  const defaults=[
    ['Thermal Imager','213','not verified'],
    ['SCBA Frame','EFS-2001','not verified'],
    ['Cardiac Monitor','CM2328','not verified'],
    ['Saw','','not verified'],
    ['Line A','DUP','not verified'],
    ['Line B','DUP','not verified'],
    ['Thermal Imager','394','verified'],
    ['Safety Line','555','not verified']
  ];
  const rows=(options.rows||defaults).map(([title,assetTag,status,quantity=1])=>({title,assetTag,status,quantity}));
  const sections=new Map(),node=(key,tag='div')=>{
    const element=new MockElement(tag);sections.set(key,element);return element;};
  const list=node('[data-asset-check-list]');
  const progress=node('[data-asset-check-progress]');
  const summary=node('[data-asset-check-counts]');
  const attest=node('[data-asset-check-attest]','input');
  attest.disabled=true;
  const record=node('[data-asset-check-record]','button');record.disabled=true;
  const stop=node('[data-asset-check-stop]','button');
  const load=node('[data-asset-check-load]','button');
  const wrap=node('[data-asset-check-attest-wrap]');
  const section={style:{display:'block'},querySelector:key=>sections.get(key)||null};
  const document={
    createElement:tag=>new MockElement(tag),
    getElementById:()=>section
  };
  const input=new FakeInput();
  let clicks=0;
  const nativeRowControl=row=>!options.rowControls?null:{
    isConnected:true,
    click(){clicks++;if(!options.neverConfirm)row.status='verified';}
  };
  const native=()=>options.nativeMissing?null:{
    input,button:{
      isConnected:true,
      click(){
        clicks++;
        if(options.neverConfirm)return;
        const targets=rows.filter(row=>row.assetTag.toUpperCase()===input.value);
        if(targets.length===1)targets[0].status='verified';
      }
    }
  };
  const code='let assetGuideLastScan=0,assetBatchPreview=null,'+
    'assetBatchRunning=false,assetBatchCancel=false,assetScanBusy=false;'+
    'const attemptedAssetRecords=new Set();\n'+
    'async function scanAllNativeAssetRows(){return readAssetReviewRows();}\n'+
    'const isExcludedAsset=row=>/^Paratech\\b/i.test(clean(row?.title||\'\'));\n'+
    logic+'\nreturn {loadAssetChecklist,buildReviewedAssetChecklist,'+
    'recordReviewedAssetChecklist,countReviewedAssetChoices,'+
    'getPreview:()=>assetBatchPreview,'+
    'getAttempts:()=>attemptedAssetRecords};';
  const create=new Function('document','isAssetPage','inspectionId',
    'ASSET_UNIT_ID','t504Visible','readPending','readRopes',
    'readNativeAssetTotals','readAssetReviewRows','clean',
    'location','findNativeAssetTagEntry','findNativeRowVerifyControl','HTMLInputElement',
    'Event','setTimeout','refreshAssetReviewGuide','ASSET_GUIDE_ID',code);
  const app=create(document,()=>options.wrongRoute!==true,
    ()=>options.wrongUnit?'9999':'60443','60443',()=>true,
    ()=>options.activeDraft?{}:null,()=>null,
    ()=>options.nativeNull?null:{total:90,required:76,completed:14,maintenance:16},
    ()=>rows,clean,{pathname:'/inspections/60443/assets/group/-1'},
    native,nativeRowControl,FakeInput,class Event{constructor(t){this.type=t;}},
    fn=>fn(),()=>{},'rebel-iq-t504-asset-guide');
  return {app,rows,list,attest,record,summary,progress,load,stop,input,
    clicks:()=>clicks,
    choice:(index,value)=>{
      const control=list.children[index].children[1];
      control.value=value;control.onchange();
    }
  };
}
test('Load finds every Not Verified row and defaults answers to Verified without writing',async()=>{
  const h=scenario();
  await h.app.loadAssetChecklist();
  const p=h.app.getPreview();
  assert.equal(p.items.length,7);
  assert.ok(p.items.every(item=>item.choice==='verified'));
  assert.equal(h.list.children.length,7);
  assert.equal(h.clicks(),0);
  assert.equal(h.attest.checked,false);
  assert.equal(h.record.disabled,true);
  assert.match(h.summary.textContent,/7 unverified entries \(7 required pieces\)/);
  assert.equal(p.items.filter(item=>item.recordable).length,4);
  assert.equal(p.unmapped,82);
});
test('the inspector can change individual defaults to Missing, Not Working, Damaged and Skip',async()=>{
  const h=scenario();await h.app.loadAssetChecklist();
  h.attest.checked=true;
  h.choice(0,'missing');h.choice(1,'not_working');
  h.choice(2,'damaged');h.choice(3,'skip');
  const p=h.app.getPreview();
  assert.deepEqual(p.items.slice(0,4).map(x=>x.choice),
    ['missing','not_working','damaged','skip']);
  assert.equal(h.attest.checked,false,'edits require fresh human confirmation');
  assert.match(h.summary.textContent,/3 exceptions/);
  assert.match(h.summary.textContent,/1 skipped/);
  assert.equal(h.clicks(),0);
});
test('no native actions occur before review and explicit inspected/present/working attestation',async()=>{
  const h=scenario();
  await h.app.loadAssetChecklist();
  await h.app.recordReviewedAssetChecklist();
  assert.equal(h.clicks(),0);
  assert.match(h.progress.textContent,/Not ready/);
  assert.equal(h.rows[0].status,'not verified');
});
test('one reviewed action records all present and working choices but not exceptions',async()=>{
  const h=scenario();await h.app.loadAssetChecklist();
  h.choice(2,'missing');h.choice(3,'skip');
  h.attest.checked=true;
  await h.app.recordReviewedAssetChecklist();
  assert.equal(h.clicks(),3,'213, EFS-2001 and 555 recorded sequentially');
  assert.equal(h.rows[0].status,'verified');
  assert.equal(h.rows[1].status,'verified');
  assert.equal(h.rows.find(x=>x.assetTag==='555').status,'verified');
  assert.equal(h.rows.find(x=>x.assetTag==='CM2328').status,'not verified');
  assert.equal(h.rows.find(x=>x.assetTag==='DUP').status,'not verified');
  assert.equal(h.app.getPreview(),null);
  assert.match(h.progress.textContent,/Operative IQ confirmed Verified: 3\/3 selected assets/);
});
test('nonconfirming native attempt stops and never claims Verified, even after retry',async()=>{
  const h=scenario({neverConfirm:true});await h.app.loadAssetChecklist();
  h.attest.checked=true;
  await h.app.recordReviewedAssetChecklist();
  assert.equal(h.clicks(),1);
  assert.match(h.progress.textContent,/Official Verified status not confirmed/);
  assert.equal(h.app.getAttempts().size,1);
  await h.app.loadAssetChecklist();h.attest.checked=true;
  await h.app.recordReviewedAssetChecklist();
  assert.equal(h.clicks(),1,'already attempted tag is not retried automatically');
});
test('unreadable/duplicate tags are displayed in the review but not silently certified',async()=>{
  const h=scenario();await h.app.loadAssetChecklist();
  const p=h.app.getPreview();
  assert.equal(p.items.filter(x=>!x.recordable).length,3);
  assert.match(h.summary.textContent,/3 manual\/ambiguous/);
  assert.match(h.summary.textContent,/manual\/ambiguous/);
});
test('wrong T504 unit, wrong route or unavailable native totals never allow recording',async()=>{
  for(const options of [{wrongUnit:true},{wrongRoute:true},{nativeNull:true},{activeDraft:true}]){
    const h=scenario(options);await h.app.loadAssetChecklist();
    assert.equal(h.app.getPreview(),null,JSON.stringify(options));
    h.attest.checked=true;
    await h.app.recordReviewedAssetChecklist();
    assert.equal(h.clicks(),0,JSON.stringify(options));
  }
});
test('native button missing or unavailable stops before any asset is recorded',async()=>{
  const h=scenario({nativeMissing:true});await h.app.loadAssetChecklist();
  h.attest.checked=true;
  await h.app.recordReviewedAssetChecklist();
  assert.equal(h.clicks(),0);
  assert.match(h.progress.textContent,/Cannot identify the native Present\/Verified control/);
});
test('no direct API writes, no unchecked bulk PASS, no modal and no extra popup',async()=>{
  assert.match(logic,/attest\.checked/);
  assert.match(logic,/attemptedAssetRecords\.add\(key\)/);
  assert.match(logic,/native\.button\.click\(\)/);
  assert.match(logic,/actual.length===1 && actual\[0\].title===item.title/);
  assert.match(logic,/const maximum=chosen.length/);
  assert.doesNotMatch(logic,/assetBatchPilotConfirmed/);
  assert.doesNotMatch(logic,/\bfetch\(|GM_xmlhttpRequest\(|\.submit\(|window\.confirm\(/);
  assert.match(src,/^\/\/ @version\s+0\.1\.21/m);
});

test('native row check control records present even when tag scanner cannot be found',async()=>{
  const h=scenario({rowControls:true,nativeMissing:true});
  await h.app.loadAssetChecklist();
  h.attest.checked=true;
  await h.app.recordReviewedAssetChecklist();
  assert.equal(h.rows.filter(x=>x.status==='verified').length,6);
  assert.equal(h.clicks(),5,'each uniquely identified pending row gets its native check');
  assert.match(h.progress.textContent,/Operative IQ confirmed Verified: 5\/5 selected assets/);
});
test('Paratech alone is outside the crew check, never offered or recorded',async()=>{
  const h=scenario({rowControls:true,nativeMissing:true,rows:[
    ['Paratech Base Plate','UNASSIGNED','not verified',6],
    ['Paratech Contour Base','UNASSIGNED','not verified',4],
    ['Paratech Extension','UNASSIGNED','not verified',3],
    ['Already Checked','COMP1','verified',1]
  ]});
  await h.app.loadAssetChecklist();
  assert.equal(h.app.getPreview(),null);
  assert.match(h.progress.textContent,/No unverified crew assets/);
  h.attest.checked=true;
  await h.app.recordReviewedAssetChecklist();
  assert.equal(h.clicks(),0);
});
test('real T504 layout has 52 unverified entries representing 76 required units, not 24 missing',async()=>{
  const pars=[6,4,3,3,2,2,2,4,2,2,2,4];
  const nativeRows=[
    ...Array.from({length:40},(_,i)=>['Tagged Asset '+i,'ASSET'+i,'not verified',1]),
    ...pars.map((quantity,i)=>['Paratech Catalog '+i,'UNASSIGNED','not verified',quantity]),
    ...Array.from({length:14},(_,i)=>['Completed Asset '+i,'COMP'+i,'verified',1])
  ];
  const h=scenario({rows:nativeRows,nativeMissing:true});
  await h.app.loadAssetChecklist();
  const p=h.app.getPreview();
  assert.equal(p.items.length,40);
  assert.equal(p.pendingUnits,40);
  assert.equal(p.excludedCount,12);
  assert.equal(p.excludedUnits,36);
  assert.equal(p.unmapped,0);
  assert.equal(p.pendingUnmapped,0);
  assert.equal(p.items.filter(item=>item.recordable).length,40);
  assert.equal(p.items.filter(item=>!item.recordable).length,0);
  assert.match(h.summary.textContent,/40 unverified entries \(40 required pieces\)/);
  assert.doesNotMatch(h.summary.textContent,/24 pieces unaccounted for/);
  assert.equal(h.clicks(),0,'reviewing drafts never updates physical equipment');
  assert.ok(p.items.every(item=>!item.title.startsWith('Paratech')));
  assert.match(h.summary.textContent,/Paratech excluded \(12 entries, 36 pieces\)/);
});
