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
const code=section('async function scanPpeCrewOwners(owners, progress = null, options = {}) {',
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

test('read-only Captain history preserves verified crew gear if one off-duty owner has no uniquely confirmed PPE',async()=>{
  const h=harness(async (name,i)=>{
    if(name==='Robert Brooks')throw Error('Responsible Party "Robert Brooks" was not confirmed as the ONE selected owner');
    return {pageCount:1,rowCount:1,items:[{pool:'300045',itemId:String(i),
      assetId:'ITEM-'+i,ownerName:name,status:'In Service'}]};
  });
  const r=await h.scan(crew,null,{readOnlyAllowUnresolved:true});
  assert.deepEqual(h.calls,crew.map(x=>x.name),'continue to inspect remaining owners');
  assert.equal(r.items.length,crew.length-1);
  assert.equal(r.ownerErrors.length,1);
  assert.equal(r.ownerErrors[0].name,'Robert Brooks');
  assert.match(r.ownerErrors[0].error,/not confirmed as the ONE selected owner/);
  assert.equal(r.searches.length,crew.length-1);
});
test('unreadable Vector page is still a blocking error, even in partial read-only mode',async()=>{
  const h=harness(async name=>{if(name==='Mike Baldree')
      throw Error('PPE rows did not stabilize before timeout');
    return {pageCount:1,rowCount:1,items:[{pool:'300045',itemId:'15',
      assetId:'ITEM-15',ownerName:name}]};
  });
  await assert.rejects(h.scan(crew,null,{readOnlyAllowUnresolved:true}),
    /Mike Baldree: PPE rows did not stabilize.*Crew check stopped/);
});
test('Captain history does not treat unresolved ownership as passed inspections',()=>{
  const daily=section('async function startCaptainDailyCheck(set, auditAsOfDate) {',
    'async function resumeCaptainDailyCheck() {');
  const report=section('function buildCaptainDailyReport(check) {',
    'function showCaptainHistoricalOffEditor(');
  assert.match(daily,/readOnlyAllowUnresolved:true/);
  assert.match(daily,/Native PPE ownership unverified:/);
  assert.match(daily,/if \(!items.length\) throw new Error\('Daily Captain Check found no mapped PPE items/);
  assert.match(report,/allReadable = itemRows.length > 0/);
  assert.match(report,/&& !discovery.error/);
});

test('actual Captain report keeps valid native green receipts but marks unresolved owner NOT COMPLIANT',()=>{
  const reportBody=section('function buildCaptainDailyReport(check) {',
    'function showCaptainHistoricalOffEditor(');
  const make=new Function('captainAuditWindow','captainOwnerTourDuty',
    'localTodayKey','getCaptainHistoricalOffTours',reportBody+
    '\nreturn buildCaptainDailyReport;')(
    ()=>({startDate:'2026-11-15',months:['2026-11'],tours:[
      {startDate:'2026-11-15',endDate:'2026-11-16',
       month:'2026-11',eligibleDates:['2026-11-15','2026-11-16']}] }),
    ()=>({due:true,off:false,unknown:false,dutyDates:['2026-11-15']}),
    ()=> '2026-11-15',()=>({schemaVersion:1,entries:{}})
  );
  const result=make({
    checkId:'read-only-test',setId:'crew',setName:'Station 4',shift:'C',
    auditAsOfDate:'2026-11-15',
    owners:[{name:'Michael Brion',prefix:'P-BRION'},
      {name:'Robert Brooks',prefix:'P-BROOKS'}],
    discovery:[{name:'Robert Brooks',prefix:'P-BROOKS',
      unknown:[],error:'Native PPE ownership unverified'}],
    items:[{ownerPrefix:'P-BRION',assetId:'BRION-COAT',type:'Bunker Coat'}],
    results:[{ownerPrefix:'P-BRION',assetId:'BRION-COAT',
      status:'ok',tour:{dates:['2026-11-15']}}]
  });
  assert.equal(result.ownerCount,2);
  assert.equal(result.owners[0].tourCheckOk,true);
  assert.equal(result.owners[0].tourPassedCount,1);
  assert.equal(result.owners[1].gearCount,0);
  assert.equal(result.owners[1].compliant,false);
  assert.equal(result.owners[1].allReadable,false);
  assert.match(result.owners[1].discoveryError,/unverified/);
});

test('historical Captain grid retains an explicit visible person row for owners with zero verified gear',()=>{
  const renderer=section('function showCaptainDailyReport(',
    'function showCaptainDailySetPicker() {');
  assert.match(renderer,/if \(!ownerItems\.length\) \{/);
  assert.match(renderer,/person\.textContent=owner\.name\|\|owner\.prefix\|\|'Unknown'/);
  assert.match(renderer,/PPE INVENTORY UNVERIFIED/);
  assert.match(renderer,/NO VERIFIED EQUIPMENT LIST\. INSPECTION HISTORY UNKNOWN/);
  assert.match(renderer,/placeholder\.append\(person,item,monthsUnknown\)/);
  assert.match(renderer,/tbody\.appendChild\(placeholder\)/);
});
