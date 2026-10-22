'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const clean=x=>String(x??'').trim();
const masterNameKey=x=>clean(x).toLowerCase().replace(/\s+/g,' ');
function section(start,end){
  const i=script.indexOf('    '+start),j=script.indexOf('    '+end,i+1);
  assert.ok(i>=0&&j>i,start+' boundaries');
  return script.slice(i,j);
}
const code=section('async function scanPpeCrewOwners(owners, progress = null) {',
  'async function scanPpeOwnerInventory(progress = null) {')+
  '\nreturn scanPpeCrewOwners;';
const crew=['Michael Brion','Mike Baldree','Jerry Weems','Robert Brooks','Jarred Weston']
  .map((name,i)=>({name,prefix:'PERSON-'+String(i).padStart(16,'0')}));
function harness(factory){
  const calls=[];
  const scan=new Function('getConfig','clean','masterNameKey','scanPpeByResponsibleParty',code)(
    ()=>({inspectorName:'Michael Brion'}),clean,masterNameKey,async name=>{
      calls.push(name);
      if(factory)return factory(name,calls.length);
      return {items:[{pool:'300045',itemId:String(calls.length),
        assetId:'ITEM-'+calls.length,ownerName:name,status:'In Service'}],
        pageCount:1,rowCount:1};
    });
  return {scan,calls};
}
test('Daily Captain five-person check performs exactly five native Responsible Party filters',async()=>{
  const h=harness();
  const result=await h.scan(crew);
  assert.deepEqual(h.calls,crew.map(p=>p.name));
  assert.deepEqual(result.searches.map(s=>s.name),h.calls);
  assert.ok(result.searches.every(s=>s.filter==='Responsible Party'));
  assert.equal(result.items.length,5);
  assert.equal(result.scope,'verified-crew-search');
});
test('Serial-number and SCBA mask equipment remains discoverable without a surname prefix',async()=>{
  const h=harness(async name=>({pageCount:2,rowCount:17,items:[
    {pool:'300045',itemId:'1',assetId:'BRION-COAT',ownerName:name},
    {pool:'500123',itemId:'2',assetId:'E004015306F2D8FE',ownerName:name,type:'SCBA Face Mask'}
  ]}));
  const r=await h.scan(crew.slice(0,1));
  assert.deepEqual(r.items.map(x=>x.assetId),['BRION-COAT','E004015306F2D8FE']);
});
test('Missing PPE for any selected crew member stops rather than claiming partial compliance',async()=>{
  const h=harness(async name=>{
    if(name==='Mike Baldree')throw Error('No PPE assigned');
    return {items:[{pool:'300045',itemId:'1',assetId:'A',ownerName:name}],
      pageCount:1,rowCount:1};
  });
  await assert.rejects(h.scan(crew),/Mike Baldree: No PPE assigned.*incomplete roster/);
  assert.equal(h.calls.length,2);
});
test('Wrong Responsible Party is never included in the crew census',async()=>{
  const h=harness(async()=>({pageCount:1,rowCount:1,items:[
    {pool:'300045',itemId:'1',assetId:'X',ownerName:'Other Person'}
  ]}));
  await assert.rejects(h.scan(crew.slice(0,1)),/PPE ownership conflict/);
});
test('Same PPE item cannot belong to two selected crew members',async()=>{
  const h=harness(async name=>({pageCount:1,rowCount:1,items:[
    {pool:'300045',itemId:'1',assetId:'SAME',ownerName:name}
  ]}));
  await assert.rejects(h.scan(crew.slice(0,2)),/assigned to two selected crew members/);
});
test('Daily and monthly use targeted filters; roster rebuild alone can scan the department',()=>{
  const daily=section('async function startCaptainDailyCheck(set, auditAsOfDate) {',
    'async function resumeCaptainDailyCheck() {');
  const preview=section('async function buildPreview(modeKey, ownerInput) {',
    'async function launchMyInspectionFromAnywhere(modeKey) {');
  assert.match(daily,/await scanPpeCrewOwners\(owners,/);
  assert.match(preview,/await scanPpeByResponsibleParty\(owners\[0\]\.name/);
  assert.match(preview,/await scanPpeCrewOwners\(owners,/);
  assert.doesNotMatch(daily+preview,/scanPpeOwnerInventory\(/);
  assert.match(script,/scope:'responsible-party-filter'/);
});
test('Crew editor no longer requests or saves PPE search prefixes',()=>{
  const editor=section('function renderCaptainSets() {','function renderSignatures() {');
  assert.doesNotMatch(editor,/PPE asset search prefixes for selected crew/);
  assert.doesNotMatch(editor,/savedSearchPrefixes/);
  const profile=section('function renderProfile() {','function renderLinkedEquipment() {');
  assert.doesNotMatch(profile,/My PPE asset prefix/);
  assert.doesNotMatch(profile,/newPrefix/);
});
