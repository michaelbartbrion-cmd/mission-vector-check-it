'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=src.indexOf('    function normalizeLinkedPpeAssets(raw) {');
const end=src.indexOf('    function migrateV2Config() {',start);
assert.ok(start>=0&&end>start,'exact-ID PPE helper functions must exist');
const code=src.slice(start,end)+'\nreturn {normalizeLinkedPpeAssets,linkedPpeForPerson,linkVerifiedPpeAsset,unlinkPpeAsset,verifyExactPpeOwnership};';
const clean=v=>String(v??'').trim();
const nameKey=v=>clean(v).toLowerCase().replace(/\s+/g,' ');
const asset={assetId:'E004015306F2D8FE',ownerName:'Michael Brion',pool:'334567',
 itemId:'765432',type:'SCBA Face Mask',status:'In Service'};
function harness(results=[asset]){
 let requests=[];
 const f=new Function('clean','masterNameKey','scanPpeOwnerSearch','getConfig','Date',code);
 const api=f(clean,nameKey,async(owner,progress)=>{
  requests.push({...owner});
  return {items:results.filter(r=>nameKey(r.ownerName)===nameKey(owner.name))};
 },()=>({linkedPpeAssets:{}}),Date);
 return {api,requests};
}
test('exact SCBA mask ID is found by a one-item search and explicit Responsible Party',async()=>{
 const h=harness();
 const item=await h.api.verifyExactPpeOwnership('Michael Brion','E004015306F2D8FE');
 assert.equal(item.type,'SCBA Face Mask');
 assert.deepEqual(h.requests,[{name:'Michael Brion',prefix:'E004015306F2D8FE'}]);
 const config={linkedPpeAssets:{}};
 assert.equal(h.api.linkVerifiedPpeAsset(config,'Michael Brion',item,item.assetId),1);
 assert.deepEqual(h.api.linkedPpeForPerson('Michael Brion',config).map(x=>x.assetId),['E004015306F2D8FE']);
});
test('mismatched Responsible Party cannot be linked or guessed from Location',async()=>{
 const h=harness([{...asset,ownerName:'Robert Brooks'}]);
 await assert.rejects(h.api.verifyExactPpeOwnership('Michael Brion',asset.assetId),/did not confirm exactly one|No PPE could be verified/);
 const config={linkedPpeAssets:{}};
 assert.throws(()=>h.api.linkVerifiedPpeAsset(config,'Michael Brion',{...asset,ownerName:'Robert Brooks'},asset.assetId),/did not both match/);
 assert.deepEqual(config.linkedPpeAssets,{});
});
test('a partial serial search result cannot be saved as an exact asset ID',async()=>{
 const h=harness([{...asset,assetId:'E004015306F2D8FE-EXTRA'}]);
 await assert.rejects(h.api.verifyExactPpeOwnership('Michael Brion',asset.assetId),/did not confirm exactly one/);
 const config={linkedPpeAssets:{}};
 assert.throws(()=>h.api.linkVerifiedPpeAsset(config,'Michael Brion',{...asset,assetId:'WRONG'},asset.assetId),/did not both match/);
});
test('refuses links for out-of-service gear',()=>{
 const h=harness(),config={linkedPpeAssets:{}};
 assert.throws(()=>h.api.linkVerifiedPpeAsset(config,'Michael Brion',{...asset,status:'Out of Service'},asset.assetId),/not In Service/);
 assert.deepEqual(config.linkedPpeAssets,{});
});
test('one Vector item cannot be linked locally to two separate owners',()=>{
 const h=harness(),config={linkedPpeAssets:{}};
 h.api.linkVerifiedPpeAsset(config,'Michael Brion',asset,asset.assetId);
 assert.throws(()=>h.api.linkVerifiedPpeAsset(config,'Robert Brooks',
 {...asset,ownerName:'Robert Brooks'},asset.assetId),/already linked locally/);
 assert.equal(h.api.linkedPpeForPerson('Michael Brion',config).length,1);
});
test('duplicate link is idempotent, and unlink never changes Vector ownership',()=>{
 const h=harness(),config={linkedPpeAssets:{}};
 h.api.linkVerifiedPpeAsset(config,'Michael Brion',asset,asset.assetId);
 h.api.linkVerifiedPpeAsset(config,'Michael Brion',asset,asset.assetId);
 assert.equal(h.api.linkedPpeForPerson('Michael Brion',config).length,1);
 assert.equal(h.api.unlinkPpeAsset(config,'Michael Brion',asset.pool,asset.itemId),true);
 assert.equal(h.api.linkedPpeForPerson('Michael Brion',config).length,0);
});
test('malformed imported metadata is rejected by normalizer',()=>{
 const h=harness();
 const out=h.api.normalizeLinkedPpeAssets({
  'michael brion':[
   {...asset,itemId:'xyz'}, {...asset,ownerName:'Robert Brooks'},asset
  ],
  'other name':[{...asset,ownerName:'Michael Brion'}]
 });
 assert.equal(out['michael brion'].length,1);
 assert.equal(out['other name'],undefined);
});
test('Exact-ID lookup stays separate from real inspection templates and department roster scans',()=>{
 assert.match(src,/\['equipment', 'Assigned PPE'\]/);
 assert.match(src,/mainAction\('Assigned PPE', \(\) => showSettings\('equipment'\), false\)/);
 assert.match(src,/async function verifyExactPpeOwnership/);
 assert.match(src,/await scanPpeOwnerSearch\(\{ name, prefix: id \}/);
 assert.doesNotMatch(src.slice(start,end),/scanPpeOwnerInventory\(/);
 const p=src.indexOf('    async function buildPreview(modeKey, ownerInput)');
 const q=src.indexOf('    async function launchMyInspectionFromAnywhere',p);
 assert.ok(p>=0&&q>p);
 assert.doesNotMatch(src.slice(p,q),/linkedPpeForPerson|linkedPpeAssets/);
 assert.doesNotMatch(src.slice(p,q),/verifyExactPpeOwnership/);
});
