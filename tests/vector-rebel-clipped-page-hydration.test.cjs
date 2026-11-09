'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');

function cut(start,end) {
  const a=src.indexOf(start), b=src.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start+' .. '+end);
  return src.slice(a,b);
}
const verifyCode=cut('    async function verifyPpeDetailIdentity(item) {',
  '    function isCompletedInspectionView(modeTitle) {');
const recoveryCode=cut('    function resolveClippedPpeNameFromVerifiedDetail(item) {',
  '    let identityElementCache =');
const identityCode=cut('    function findAssetIdentityElement(item) {',
  '    function assetPageContainsExpectedId(item) {');
const verifyFactory=new Function(
  'isAssetPageFor','clean','verifyExpectedAssetPage','waitFor',
  'resolveClippedPpeNameFromVerifiedDetail','findAssetIdentityElement',
  verifyCode+'\nreturn verifyPpeDetailIdentity;'
);
const recoverFactory=new Function(
  'clean','isAssetPageFor','repairReadDetailDocument','document',
  'visible','PANEL_ID','OVERLAY_ID','uiText','normalizedPpeTypeText','escapeRegex',
  recoveryCode+'\nreturn resolveClippedPpeNameFromVerifiedDetail;'
);
const identityFactory=new Function(
  'clean','isAssetPageFor','document','visible','PANEL_ID',
  'OVERLAY_ID','location','escapeRegex','uiText','findAssetSerialEvidence',
  'let identityElementCache={key:"",element:null};\n'+identityCode+
  '\nreturn findAssetIdentityElement;'
);
const clean=x=>String(x??'').replace(/\s+/g,' ').trim();
const tuples=[
 ['Bunker Coat','BALDREE-10948322-F...','BALDREE-10948322-FL','10948322','300045','4604890'],
 ['Structural Gloves','BALDREE-3290824-BU...','BALDREE-3290824-BU','3290824','299879','4598134'],
 ['Hood','BALDREE-3290326-BU...','BALDREE-3290326-BU','3290326','299900','4599982'],
 ['Structural Boot','BALDREE-5633595-BB...','BALDREE-5633595-BB','5633595','299881','4598714'],
 ['SCBA Face Mask','E004015306F73814...','E004015306F73814','E004015306F73814','299947','4601272']
];
function makePage(tuple,opts={}) {
  const [type,clipped,full,serial,pool,itemId]=tuple;
  const item={assetId:clipped,pool,itemId,ownerName:'Michael Baldree',type};
  const location={pathname:'/app/equipment/PPE/pool/'+pool+'/'+itemId+'/item'};
  location.href='https://checkitapp.targetsolutions.com'+location.pathname;
  const readyAt=opts.readyAt??40;
  let polls=0,directChecks=0;
  const observedSerial=opts.serial??serial;
  const headers=opts.headers??[opts.heading??type+': '+full];
  const element=text=>({textContent:text,isConnected:true,closest:()=>null});
  const document={querySelectorAll:()=>polls>=readyAt?headers.map(element):[]};
  const routeOk=candidate=>location.pathname===
    '/app/equipment/PPE/pool/'+candidate.pool+'/'+candidate.itemId+'/item';
  const resolve=recoverFactory(clean,routeOk,
    ()=>({serial:polls>=readyAt?observedSerial:''}),
    document,()=>true,'panel','overlay',clean,x=>clean(x).toLowerCase(),x=>x);
  const findIdentity=identityFactory(clean,routeOk,document,()=>true,
    'panel','overlay',location,x=>x,clean,()=>null);
  const waitFor=async(fn,timeout,interval)=>{
    assert.equal(timeout,18000);
    assert.equal(interval,180);
    for(let i=0;i<100;i++){
      polls++;
      const result=fn();
      if(result)return result;
    }
    throw Error('No proven PPE identity');
  };
  const verifier=verifyFactory(routeOk,clean,
    async candidate=>{directChecks++;return routeOk(candidate)&&candidate.assetId===full;},
    waitFor,resolve,findIdentity);
  return {item,full,location,verifier,
    polls:()=>polls,directChecks:()=>directChecks};
}
for(const tuple of tuples) {
  test('real ' + tuple[0] + ' clipped identity is retried until both proofs appear',async()=>{
    const p=makePage(tuple,{readyAt:40});
    const proof=await p.verifier(p.item);
    assert.equal(proof?.restoredName,p.full);
    assert.equal(proof?.verifiedItem.assetId,p.full);
    assert.equal(p.item.assetId,tuple[1],'caller must not mutate unverified inventory');
    assert.equal(p.polls(),40);
    assert.equal(p.directChecks(),0);
  });
}
test('mismatched serial, PPE type, name, or ambiguous headings remain blocked',async()=>{
  const coat=tuples[0];
  for(const config of [
    {serial:'99999999'},
    {heading:'Bunker Pant: '+coat[2]},
    {heading:'Bunker Coat: OTHER-10948322-FL'},
    {headers:['Bunker Coat: '+coat[2],'Bunker Coat: BALDREE-10948322-FR']}
  ]){
    const p=makePage(coat,{...config,readyAt:1});
    assert.equal(await p.verifier(p.item),null,JSON.stringify(config));
    assert.equal(p.item.assetId,coat[1]);
  }
});
test('wrong pool/item URL fails before name resolution',async()=>{
  const p=makePage(tuples[0],{readyAt:1});
  p.location.pathname='/app/equipment/PPE/pool/300045/9999999/item';
  assert.equal(await p.verifier(p.item),null);
  assert.equal(p.polls(),0);
});
test('unclipped exact identity keeps the original verifier',async()=>{
  const p=makePage(tuples[0],{readyAt:100});
  const item={...p.item,assetId:p.full};
  const proof=await p.verifier(item);
  assert.equal(proof?.verifiedItem,item);
  assert.equal(proof?.restoredName,'');
  assert.equal(p.polls(),0);
  assert.equal(p.directChecks(),1);
});
test('Tour fail-closed stop never starts inspection or saves guessed name',async()=>{
  const tour=cut('    async function openInspectionForCurrentAsset(run) {',
    '        const itemKey =');
  const factory=new Function('isAssetPageFor','location','getItemInspectionMode',
    'verifyPpeDetailIdentity','stopRun','saveRun','setStatus',
    tour+'\nreturn false;\n}\nreturn openInspectionForCurrentAsset;');
  let stops=0,saves=0;
  const run={index:0,items:[{...makePage(tuples[0]).item}]};
  const action=factory(()=>true,{href:'https://invalid.example'},()=>({}),
    async()=>null,()=>{stops++;},()=>{saves++;},()=>{});
  await action(run);
  assert.equal(stops,1);
  assert.equal(saves,0);
  assert.equal(run.items[0].assetId,tuples[0][1]);
});
test('read-only Captain uses same identity gate before inspecting history',()=>{
  const audit=cut('    async function readCaptainComplianceHistory(item) {',
    '    function buildCaptainDailyReport(check) {');
  assert.match(audit,/await verifyPpeDetailIdentity\(item\)/);
  assert.ok(audit.indexOf('if (!proof)')<audit.indexOf('revealAssetHistory'));
  assert.doesNotMatch(audit,/Submit Inspection|saveRun\(/);
});

test('release candidate version is consistent across userscript and managed update manifest',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../beta/version.json'),'utf8'));
  const meta=src.match(/^\/\/ @version\s+(\S+)/m)?.[1];
  const runtime=src.match(/const VERSION = '([^']+)'/)?.[1];
  const instance=src.match(/window\.__vectorRebelInstance = \{\s*version: '([^']+)'/)?.[1];
  assert.equal(meta,'3.2.54');
  assert.equal(meta,manifest.latestVersion);
  assert.equal(meta,runtime);
  assert.equal(meta,instance);
  assert.match(src,/^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/michaelbartbrion-cmd\/mission-vector-check-it\/main\/beta\/vector-rebel\.user\.js/m);
});

test('SCBA exact alpha-numeric serial must not match a numeric substring or near-collision',async()=>{
  const mask=tuples.find(tuple=>tuple[0]==='SCBA Face Mask');
  assert.ok(mask);
  for(const config of [
    {serial:'004015306'},
    {serial:'E004015306F7381A'},
    {serial:'E004015306F73814A'},
    {serial:'BALDREE-E004015306F73814'},
    {heading:'SCBA Face Mask: E004015306F73814A'},
    {heading:'Bunker Coat: E004015306F73814'},
    {headers:['SCBA Face Mask: E004015306F73814','SCBA Face Mask: E004015306F73814-OTHER']}
  ]){
    const p=makePage(mask,{...config,readyAt:1});
    assert.equal(await p.verifier(p.item),null,JSON.stringify(config));
    assert.equal(p.item.assetId,mask[1],'no unproven mask label saved');
  }
});
test('SCBA mask with no separately labeled serial fails closed despite exact heading',async()=>{
  const p=makePage(tuples[4],{serial:'',readyAt:1});
  assert.equal(await p.verifier(p.item),null);
});
