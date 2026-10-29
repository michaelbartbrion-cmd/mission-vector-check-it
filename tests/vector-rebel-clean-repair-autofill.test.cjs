'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const extract=(begin,end)=>{const a=src.indexOf(begin),b=src.indexOf(end,a+begin.length);assert.ok(a>0&&b>a,begin);return src.slice(a,b)};
const state={config:{inspectorName:'Michael Brion',ppeRepairProfile:{
  idNumber:'',shift:'',pickupStation:'',deliveryStation:''
}},local:{'michael brion':{pickupStation:'4',deliveryStation:'4',shift:'C',idNumber:'911'}}};
const loadJSON=(key,fallback)=>key==='vr_ppe_repair_contact_v1'?state.local:key==='vr_ppe_repair_verified_details_v1'?{}:fallback;
const gearMatcher=new Function(extract('function repairGearMatches(label, item) {','function repairXml(value) {')+';return repairGearMatches;')();
const api=new Function('loadJSON','saveJSON','clean','masterNameKey','getConfig','cloneConfig','saveConfig','repairGearMatches',
 extract('const PPE_REPAIR_PROFILE_FIELDS=Object.freeze([','function showPpeCleanRepairForm() {')+
 ';return {repairPersonDefaults,repairPersistPersonDefaults,repairDefaultAsset,repairGearTier,repairSlotFromAsset,repairReadDetailText,repairReadDetailDocument,repairFieldValid};')(
 loadJSON,(key,val)=>{if(key==='vr_ppe_repair_contact_v1')state.local=val},
 v=>String(v||'').trim(),v=>String(v||'').trim().toLowerCase(),
 ()=>state.config,()=>structuredClone(state.config),val=>{state.config=val},gearMatcher
);
test('PPE form names and dates are editable, with saved station/shift/ID in Profile',()=>{
 for(const piece of ["['First and Last Name','name']","['Date','date']","['Shift','shift']",
   "['Station picked up at','pickupStation']","['Preferred station delivery','deliveryStation']"]){
   assert.ok(src.includes(piece),piece);
 }
 assert.match(src,/profileFields\.map\(entry=>\[entry\.key,clean\(entry\.input\.value\)\]\)/);
 assert.match(src,/forms\.push\(\{name:person\.name,originalName:person\.name/);
 assert.deepEqual(api.repairPersonDefaults({name:'Michael Brion'}),
  {idNumber:'911',shift:'C',pickupStation:'4',deliveryStation:'4'});
 api.repairPersistPersonDefaults([{originalName:'Michael Brion',shift:'B',pickupStation:'5',
  deliveryStation:'2',idNumber:'999'}]);
 assert.equal(state.config.ppeRepairProfile.shift,'B');
 assert.equal(state.config.ppeRepairProfile.pickupStation,'5');
 assert.equal(state.config.ppeRepairProfile.idNumber,'999');
 assert.equal(api.repairPersonDefaults({name:'Jared Weston'}).shift,'');
 assert.match(src,/input\?\.addEventListener\('blur',\(\)=>repairPersistPersonDefaults/);
});
test('FL means primary and BU means secondary without inferring ownership',()=>{
 const inventory=[
 {assetId:'BRION-10237792-FL',type:'Bunker Coat'},
 {assetId:'BRION-13313162-BU',type:'Bunker Coat'},
 {assetId:'BRION-4111218',type:'Structural Helmet'}];
 assert.equal(api.repairDefaultAsset('Primary Coat',inventory).assetId,'BRION-10237792-FL');
 assert.equal(api.repairDefaultAsset('Secondary Coat',inventory).assetId,'BRION-13313162-BU');
 assert.equal(api.repairDefaultAsset('Helmet',inventory).assetId,'BRION-4111218');
 assert.equal(api.repairDefaultAsset('Helmet (Personal)',inventory),null);
 assert.equal(api.repairGearTier({assetId:'BRION-10237792-FL'}),'primary');
 assert.equal(api.repairGearTier({assetId:'BRION-13313162-BU'}),'secondary');
 assert.equal(api.repairGearTier({assetId:'BRION-4111218'}),'unmarked');
});
test('Unrelated Vector UI label Tags must never become a serial number',()=>{
 const asset={assetId:'BRION-13313162-BU',serial:'Tags',size:'',manufacture:''};
 assert.equal(api.repairSlotFromAsset(asset).serial,'');
 assert.equal(api.repairSlotFromAsset({...asset,serial:'13313162'}).serial,'13313162');
});
test('Actual item detail shows serial and size; Year gives year only, not guessed purchase date',()=>{
 const page=['Bunker Coat: BRION-13313162-BU','Year','2022',
  'Purchase Date','08/01/2022','End of Life','08/01/2032',
  'Serial Number','13313162','Size','50-32','Length','Regular'].join('\n');
 const got=api.repairReadDetailText(page);
 assert.deepEqual(got,{serial:'13313162',size:'50-32',manufacture:'2022'});
 const full=['Serial Number','13313162','Size','50-32','Date of Manufacture',
  '08/01/2022','End of Life','08/01/2032'].join('\n');
 assert.deepEqual(api.repairReadDetailText(full),{serial:'13313162',size:'50-32',manufacture:'08/01/2022'});
 const bogus=['Serial Number','Tags','Size','Tags','Purchase Date','08/01/2022'].join('\n');
 assert.deepEqual(api.repairReadDetailText(bogus),{serial:'',size:'',manufacture:''});
});
test('Two-column DOM label/value pairs win over misleading global reading order',()=>{
 function leaf(label,value){
   const right={innerText:value,textContent:value},head={children:[],textContent:label,
      closest:()=>null,nextElementSibling:right};
   head.parentElement={children:[head,right],nextElementSibling:null};
   return head;
 }
 const dom={
   body:{innerText:['Serial Number','Tags','Size','Length','Year','2022'].join('\n')},
   querySelectorAll:()=>[leaf('Serial Number','13313162'),leaf('Size','50-32'),leaf('Year','2022')]
 };
 assert.deepEqual(api.repairReadDetailDocument(dom),{serial:'13313162',size:'50-32',manufacture:'2022'});
});
test('Export remains editable and reads source pages without writing PPE or inspections',()=>{
 const exporter=extract('function repairFormSheet(form) {','function repairSourceSheet(forms) {');
 for(const field of ['form.date','form.name','form.pickupStation','form.deliveryStation','form.shift',
   'item.serial','item.size','item.manufacture'])assert.ok(exporter.includes(field),field);
 assert.match(src,/scanPpeByResponsibleParty\(person\.name/);
 assert.match(src,/repairCaptureVisibleItemPage\(\)/);
 assert.match(src,/const found=repairReadDetailDocument\(doc\)/);
 assert.match(src,/await detailsBtn\.onclick\(\)/);
 assert.match(src,/if\(!slot\[k\]&&extra\[k\]\)/);
 assert.match(src,/finally\{frame\.remove\(\);\}/);
 assert.match(src,/View item in Vector/);
});
