'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');
function section(start, end) {
  const i = script.indexOf('    ' + start);
  const j = script.indexOf('    ' + end, i + 1);
  assert.ok(i >= 0 && j > i, 'missing ' + start);
  return script.slice(i, j);
}
const source = section('function crewPpeSearchPrefix(owner, config = getConfig()) {',
  'async function scanPpeOwnerInventory(progress = null) {') +
  '\nreturn {crewPpeSearchPrefix,scanPpeCrewOwners};';
const clean = x => String(x ?? '').trim();
const key = x => clean(x).toLowerCase().replace(/\s+/g,' ');
const surname = name => clean(name).toUpperCase().split(/\s+/).at(-1).replace(/[^A-Z0-9]/g,'');
function harness({names=[],config={},search=null}={}) {
 const calls = [];
 const rows = new Map();
 let fullCalls = 0;
 const active = {
   inspectorName: 'Michael Brion', selfPrefix: 'BRION',
   peopleDirectory: [], ...config
 };
 const fun = new Function('clean','masterNameKey','expectedSurnamePrefix',
     'getConfig','scanPpeOwnerSearch','scanPpeOwnerInventory',source);
 const api = fun(clean,key,surname,()=>active,async (owner) => {
   calls.push({name:owner.name,prefix:owner.prefix});
   if(search)return search(owner,calls.length);
   return {
     items:[{pool:'300045',itemId:String(calls.length),ownerName:owner.name,
       assetId:owner.prefix+'-COAT',status:'In Service'}],
     pageCount:1,rowCount:1
   };
 },async()=>{fullCalls++;throw Error('UNAUTHORIZED: department crawl');});
 return {api,calls,rows,fullCalls:()=>fullCalls};
}
const crew=['Michael Brion','Mike Baldree','Jerry Weems','Robert Brooks','Jarred Weston']
  .map((name,index)=>({name,prefix:'PERSON-'+String(index).padStart(16,'0')}));
test('Five-member Daily Captain check performs exactly five scoped owner searches',async()=>{
 const h=harness();
 const result=await h.api.scanPpeCrewOwners(crew);
 assert.deepEqual(h.calls.map(x=>x.prefix), ['BRION','BALDREE','WEEMS','BROOKS','WESTON']);
 assert.deepEqual(result.searches.map(x=>x.name),crew.map(x=>x.name));
 assert.equal(result.items.length,5);
 assert.equal(result.scope,'verified-crew-search');
 assert.equal(h.fullCalls(),0);
});
test('Explicit saved Captain Set search prefix overrides surname guess',()=>{
 const h=harness();
 const person={name:'Beth Smith',prefix:'PERSON-123',gearSearchPrefix:'B.SMITH'};
 assert.deepEqual(h.api.crewPpeSearchPrefix(person),{
  prefix:'B.SMITH',source:'captain-set-override'
 });
 assert.throws(()=>h.api.crewPpeSearchPrefix({...person,gearSearchPrefix:'PERSON-TEST'}),/invalid configured/);
});
test('Legacy generic M and WS0122 are not accepted as ownership-based search prefixes',()=>{
 const h=harness();
 assert.equal(h.api.crewPpeSearchPrefix({name:'Christopher Hoogerwerf',
   prefix:'PERSON-123',legacyPrefix:'M'}).prefix,'HOOGERWERF');
 assert.equal(h.api.crewPpeSearchPrefix({name:'Daniel Guerra-Herrera',
   prefix:'PERSON-234',legacyPrefix:'WS0122'}).prefix,'GUERRAHERRERA');
});
test('Known local directory prefix is used before inferred surname',()=>{
 const h=harness({config:{peopleDirectory:[
  {name:'Beth Smith',prefix:'B.SMITH'}
 ]}});
 assert.deepEqual(h.api.crewPpeSearchPrefix({name:'Beth Smith',prefix:'PERSON-1'}),
  {prefix:'B.SMITH',source:'local-person-directory'});
});
test('Missing PPE for one crew member stops the whole check, never labels partial data complete',async()=>{
 const h=harness({search:async(owner)=>{
   if(owner.name==='Mike Baldree')throw new Error('No PPE could be verified');
   return {items:[{pool:'300045',itemId:owner.name,ownerName:owner.name,
    assetId:'TEST-'+owner.name}],pageCount:1,rowCount:1};
 }});
 await assert.rejects(()=>h.api.scanPpeCrewOwners(crew),
   /Mike Baldree \(BALDREE\): No PPE could be verified.*incomplete roster was accepted/);
 assert.equal(h.calls.length,2);
 assert.equal(h.fullCalls(),0);
});
test('Conflicting live ownership for an equipment item fails closed',async()=>{
 const h=harness({search:async(owner)=>{
  return {items:[{pool:'300045',itemId:'1',assetId:'SAME-ASSET',
   ownerName:owner.name}],pageCount:1,rowCount:1};
 }});
 await assert.rejects(()=>h.api.scanPpeCrewOwners(crew.slice(0,2)),
   /assigned to two selected crew members/);
});
test('A PERSON-* roster key can never reach the Vector PPE search',()=>{
 const h=harness();
 const person={name:'Robert Brooks',prefix:'PERSON-001'};
 assert.equal(h.api.crewPpeSearchPrefix(person).prefix,'BROOKS');
});
test('Daily and monthly action paths use bounded crew search, with explicit PPE navigation mode',()=>{
 const daily=section('async function startCaptainDailyCheck(set, auditAsOfDate) {',
  'async function resumeCaptainDailyCheck() {');
 const preview=section('async function buildPreview(modeKey, ownerInput) {',
  'async function launchMyInspectionFromAnywhere(modeKey) {');
 assert.match(daily,/const freshInventory = await scanPpeCrewOwners\(owners,/);
 assert.doesNotMatch(daily,/scanPpeOwnerInventory\(/);
 assert.match(preview,/await scanPpeCrewOwners\(owners,/);
 assert.doesNotMatch(preview,/scanPpeOwnerInventory\(/);
 assert.match(script,/await ensurePpeEquipmentPage\(message => setStatus\(message\), false\);/);
});
test('Captain Sets preserve editable scoped PPE search prefixes through normalization',()=>{
 const f=section('function normalizeCaptainSets(value, peopleDirectory = []) {',
  'function normalizeCaptainRosterPrefixes(value, peopleDirectory = []) {');
 const normalize=new Function('clean','getMasterRosterState',f+
  '\nreturn normalizeCaptainSets;')(clean,()=>({people:[]}));
 const result=normalize([{name:'A Crew',memberPrefixes:['PERSON-42'],
  gearSearchPrefixes:{'PERSON-42':'B.SMITH'}}],[]);
 assert.deepEqual(result[0].gearSearchPrefixes,{'PERSON-42':'B.SMITH'});
 assert.match(script,/gearSearchPrefix: clean\(/);
 assert.match(script,/const savedSearchPrefixes = new Map/);
 assert.match(script,/gearSearchPrefixes,/);
});
