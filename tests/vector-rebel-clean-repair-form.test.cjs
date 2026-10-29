'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=source.indexOf('const PPE_REPAIR_ROWS = Object.freeze(');
const end=source.indexOf('function showPpeCleanRepairForm()',start);
assert.ok(start>-1&&end>start,'Export helpers must be packaged inside Vector Rebel');
const pure=source.slice(start,end);
const {PPE_REPAIR_ROWS,repairWorkbook,repairGearMatches,repairFormSheet,repairSourceSheet}=
 new Function('TextEncoder','Blob',pure+'\nreturn {PPE_REPAIR_ROWS,repairWorkbook,repairGearMatches,repairFormSheet,repairSourceSheet};')(TextEncoder,Blob);
const fakeAsset={assetId:'BRION-101234-FL',pool:'300045',itemId:'4602083',
 ownerName:'Michael Brion',url:'https://app.vectorcheckit.us/app/equipment/PPE/pool/300045/4602083/item',
 type:'Bunker Coat',status:'In Service'};
const form=(name='Michael Brion')=>({
 name,idNumber:'101',shift:'C',date:'2026-10-29',pickupStation:'Station 4',
 deliveryStation:'Station 4',pickupBy:'',pickupDate:'',returnedBy:'',returnedDate:'',
 capturedAt:'2026-10-29T18:00:00Z',
 items:PPE_REPAIR_ROWS.map((x,i)=>({asset:i===1?fakeAsset:null,
   serial:i===1?'101234':'',size:i===1?'Large':'',manufacture:'',issues:''}))
});
function entries(buf){
 const zip=Buffer.from(buf),parts=new Map();
 let offset=0;
 while(zip.readUInt32LE(offset)===0x04034b50){
   const nameSize=zip.readUInt16LE(offset+26),extra=zip.readUInt16LE(offset+28),
     len=zip.readUInt32LE(offset+18);
   const name=zip.subarray(offset+30,offset+30+nameSize).toString();
   const body=zip.subarray(offset+30+nameSize+extra,offset+30+nameSize+extra+len);
   parts.set(name,body.toString());offset+=30+nameSize+extra+len;
 }
 assert.equal(zip.readUInt32LE(offset),0x02014b50,'Valid central directory follows stored entries');
 assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50,'Valid ZIP end-of-central-directory');
 return parts;
}
test('Form reproduces all eleven original PPE Clean and Repair Form item rows',()=>{
 assert.deepEqual(PPE_REPAIR_ROWS,['Primary Pant','Primary Coat','Primary Gloves','Primary Hood',
 'Secondary Pant','Secondary Coat','Secondary Gloves','Secondary Hood','Helmet',
 'Helmet (Personal)','Boots']);
});
test('PPE type matching is typed, no guessing from asset prefixes',()=>{
 assert.equal(repairGearMatches('Primary Coat',fakeAsset),true);
 assert.equal(repairGearMatches('Primary Pant',fakeAsset),false);
 assert.equal(repairGearMatches('Helmet',fakeAsset),false);
 assert.equal(repairGearMatches('Boots',{type:'Structural Boots'}),true);
});
test('Workbook contains real editable per-person .xlsx worksheets and source metadata',async()=>{
 const file=await repairWorkbook([form(),form('Jared Weston')]).arrayBuffer();
 const parts=entries(file);
 assert.equal(parts.size,8); // 5 package files + two forms + source index
 assert.match(parts.get('xl/workbook.xml'),/Michael Brion/);
 assert.match(parts.get('xl/workbook.xml'),/Jared Weston/);
 assert.match(parts.get('xl/workbook.xml'),/Source Index/);
 const doc=parts.get('xl/worksheets/sheet1.xml');
 assert.match(doc,/PPE CLEAN AND REPAIR FORM/);
 assert.match(doc,/Primary Pant/);assert.match(doc,/Helmet \(Personal\)/);
 assert.match(doc,/Serial Number/);assert.match(doc,/Known Issues/);
 assert.match(doc,/Preferred delivery/);assert.match(doc,/Station 4/);
 assert.match(doc,/101234/);assert.match(doc,/2026-10-29/);
 assert.match(doc,/<mergeCell ref="A10:B10"\/>/);
 assert.match(doc,/<pageSetup orientation="landscape"/);
 const sources=parts.get('xl/worksheets/sheet3.xml');
 assert.match(sources,/BRION-101234-FL/);
 assert.match(sources,/4602083/);
 assert.match(sources,/Michael Brion/);
 assert.match(sources,/https:\/\/app.vectorcheckit.us/);
});
test('Control is visible and person selection uses the verified Responsible Party scan',()=>{
 assert.match(source,/mainAction\('PPE Clean \/ Repair Form', showPpeCleanRepairForm, false\)/);
 assert.match(source,/getActiveMasterRoster\(\)/);
 assert.match(source,/scanPpeByResponsibleParty\(person.name/);
 assert.ok(source.includes("const k=slot.asset.pool+':'+slot.asset.itemId"));
 assert.match(source,/Nothing is submitted to Vector/);
});
test('No automatic PPE inspection submission is added inside the exporter',()=>{
 const feature=source.slice(start,source.indexOf('function installPanel()',end));
 assert.doesNotMatch(feature,/submitInspection|clickSubmit|markAsPass|autoPass/);
 assert.match(feature,/if\(getRun\(\)\)/);
});
