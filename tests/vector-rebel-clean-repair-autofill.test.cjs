'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(require('node:path').join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const extract=(begin,end)=>{const a=src.indexOf(begin),b=src.indexOf(end,a+begin.length);assert.ok(a>0&&b>a);return src.slice(a,b)};
const helper=extract('function repairPersonDefaults(person) {','function showPpeCleanRepairForm()');
const local={'michael brion':{pickupStation:'Station 4',deliveryStation:'Station 4',shift:'C',idNumber:'909'}};
const api=new Function('loadJSON','saveJSON','clean','masterNameKey',helper+';return {repairPersonDefaults,repairSlotFromAsset};')(
 (_key,fallback)=>local,()=>{},v=>String(v||'').trim(),v=>String(v||'').trim().toLowerCase()
);
test('The repair form date and exact person name remain editable, and station/shift persist per person',()=>{
 assert.match(src,/\['First and Last Name','name'\]/);
 assert.match(src,/\['Date','date'\]/);
 assert.match(src,/\['Station picked up at','pickupStation'\]/);
 assert.match(src,/\['Shift','shift'\]/);
 assert.match(src,/forms\.push\(\{name:person\.name,originalName:person\.name/);
 const current=api.repairPersonDefaults({name:'Michael Brion'});
 assert.deepEqual(current,{pickupStation:'Station 4',deliveryStation:'Station 4',shift:'C',idNumber:'909'});
 const next=api.repairPersonDefaults({name:'Jared Weston'});
 assert.equal(next.shift,'');
 assert.equal(next.pickupStation,'');
});
test('Only verified PPE row metadata fills serial number, size and manufacturing date',()=>{
 const asset={assetId:'BRION-001',serial:'001222',size:'XL',manufacture:'04/12/2024'};
 assert.deepEqual(api.repairSlotFromAsset(asset),
  {asset,serial:'001222',size:'XL',manufacture:'04/12/2024',issues:''});
 assert.deepEqual(api.repairSlotFromAsset({...asset,serial:'-',size:'UNKNOWN',manufacture:'N/A'}).serial,'');
 assert.equal(api.repairSlotFromAsset({...asset,serial:'-',size:'UNKNOWN',manufacture:'N/A'}).size,'');
 assert.equal(api.repairSlotFromAsset({...asset,serial:'-',size:'UNKNOWN',manufacture:'N/A'}).manufacture,'');
});
test('Owner-verified Vector PPE row parser reads the real Serial No, Size and Mfg column when present',()=>{
 const f=extract('function responsiblePartyPpeRow(anchor) {','// Bounded PPE owner discovery');
 assert.match(f,/const headerValue = patterns =>/);
 assert.match(f,/serial: headerValue/);
 assert.match(f,/size: headerValue/);
 assert.match(f,/manufacture: headerValue/);
 assert.match(f,/\^serial\(\?: number\| no\| #\)/);
 assert.match(f,/ownerName: party/);
});
test('Changing an asset resets stale details then hydrates only the newly selected asset',()=>{
 assert.match(src,/Object\.assign\(slot,repairSlotFromAsset\(selected\)\)/);
 assert.match(src,/detailLink\.href=selected\?\.url/);
 assert.match(src,/const values=\[slot\.serial,slot\.size,slot\.manufacture,slot\.issues\]/);
});
test('All form fields are passed into the editable Excel export (no guessed manufacture dates)',()=>{
 const xml=extract('function repairFormSheet(form) {','function repairSourceSheet(forms) {');
 for(const field of ['form.date','form.name','form.pickupStation','form.deliveryStation','form.shift','item.serial','item.size','item.manufacture'])assert.ok(xml.includes(field),field);
 assert.match(src,/const xlsx=repairWorkbook\(forms\)/);
 assert.match(src,/const localDate=\[d\.getFullYear\(\)/);
});

test('Read-only detail-page text can supply serial, size and manufacture date when table omitted them',()=>{
 const fnSrc=extract('function repairReadDetailText(text) {','async function repairReadItemDetail(asset) {');
 const parser=new Function(fnSrc+'; return repairReadDetailText;')();
 const text=['Bunker Coat','Serial Number','16642722','Size','46-32','Date of Manufacture','05/14/2025','End of Life','05/14/2035'].join('\n');
 assert.deepEqual(parser(text),{serial:'16642722',size:'46-32',manufacture:'05/14/2025'});
 const noManuf=['Serial Number','16642722','Size','46-32','End of Life','05/14/2035'].join('\n');
 assert.equal(parser(noManuf).manufacture,'','Never infer manufacture date from end-of-life');
});
test('Optional bounded Vector detail prefill does not overwrite manually edited fields',()=>{
 assert.match(src,/Fill missing details from Vector/);
 assert.match(src,/if\(!slot\[k\]&&extra\[k\]\)/);
 assert.match(src,/while\(Date\.now\(\)-start<8500\)/);
 assert.match(src,/finally\{frame\.remove\(\);\}/);
});
