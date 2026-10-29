'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const pure=(start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,start);return src.slice(a,b);};
const rows=['Primary Pant','Primary Coat','Primary Gloves','Primary Hood',
 'Secondary Pant','Secondary Coat','Secondary Gloves','Secondary Hood',
 'Helmet','Helmet (Personal)','Boots'];
const asset=(name,code='FL')=>({assetId:name+'-'+code,pool:'300045',itemId:'4604970',
 ownerName:'Michael Brion',url:'https://app.vectorcheckit.us/app/equipment/PPE/pool/300045/4604970/item',type:'Bunker Pant'});
const form=(name='Michael Brion')=>({
 originalName:name,name,date:'2026-10-29',idNumber:'911',shift:'C',
 pickupStation:'4',deliveryStation:'4',pickupBy:'Kim',pickupDate:'2026-11-02',
 returnedBy:'Nolan',returnedDate:'2026-11-04',
 sourceItems:[asset('BRION-10240582','FL')],
 items:rows.map((row,i)=>i===0?{asset:asset('BRION-10240582','FL'),serial:'10240582',
   size:'44',manufacture:'2019',issues:'Seam check'}:{asset:null,serial:'',size:'',manufacture:'',issues:''})
});
const memory={},fn=src.slice(src.indexOf('const PPE_REPAIR_DRAFTS_KEY='),
 src.indexOf('function showPpeCleanRepairForm() {'));
const api=new Function('PPE_REPAIR_ROWS','loadJSON','saveJSON','masterNameKey','repairPersistPersonDefaults','repairSlotFromAsset',
 fn+';return {repairPersistDraft,repairRestoreDraft,repairAssetKey};')(
 rows,(k,def)=>memory[k]||def,(k,v)=>memory[k]=v,
 v=>String(v).toLowerCase(),()=>{},
 asset=>({asset,serial:asset.serial||'',size:asset.size||'',manufacture:'',issues:''})
);
const pdfSource=pure('// Downloadable, fully populated PDF.',"const PPE_REPAIR_DRAFTS_KEY=");
const {repairPdfDocument,repairPdfPages,repairPdfEscape}=new Function('PPE_REPAIR_ROWS',pdfSource+
 ';return {repairPdfDocument,repairPdfPages,repairPdfEscape};')(rows);

test('Save Info stores all user top fields and row corrections; restores only verified owned assets',()=>{
 const user=form();user.items[0].size='44';user.items[0].issues='Needs seam repair';
 const savedAt=api.repairPersistDraft([user]);
 assert.match(savedAt,/^20\d\d-/);
 assert.ok(memory.vr_ppe_clean_repair_saved_info_v1['michael brion']);
 const blank=form();blank.date='2026-10-30';blank.pickupStation='';
 blank.items[0].size='';
 assert.match(api.repairRestoreDraft(blank),/Saved form restored/);
 assert.equal(blank.date,'2026-10-29');
 assert.equal(blank.pickupStation,'4');
 assert.equal(blank.items[0].size,'44');
 assert.equal(blank.items[0].issues,'Needs seam repair');
 const unassigned=form();unassigned.sourceItems=[];
 assert.match(api.repairRestoreDraft(unassigned),/no longer assigned/);
 assert.equal(unassigned.items[0].issues,'');
});
test('Save Info and Save as PDF buttons are present and always visible while scrolling',()=>{
 assert.match(src,/makeButton\('Save Info'/);
 assert.match(src,/makeButton\('Save as PDF'/);
 assert.match(src,/footer\.style\.cssText\+='position:sticky;top:0/);
 assert.match(src,/saveInfoBtn\.onclick=\(\)=>/);
 assert.match(src,/pdfBtn\.onclick=\(\)=>/);
 assert.match(src,/repairPersistDraft\(forms\)/);
 assert.match(src,/anchor\.download='PPE_Clean_and_Repair_/);
});
test('Generated completed PDF is a valid multi-page PDF containing the data',async()=>{
 const people=[form(),form('Jared Weston')];
 people[1].items[0].issues='Suit test '+('long description of the issue ').repeat(6);
 const pdf=await repairPdfDocument(people).arrayBuffer();
 const buf=Buffer.from(pdf),str=buf.toString();
 assert.ok(str.startsWith('%PDF-1.4\n'));
 assert.equal(str.match(/\/Type \/Page(?!s)\b/g)?.length,4); // 2 forms + notes for each
 assert.match(str,/PPE CLEAN AND REPAIR FORM/);
 for(const item of ['10240582','2019','44','Michael Brion','Jared Weston','Pick-up By: Kim',
    'Returned By: Nolan','Seam check','KNOWN ISSUES - CONTINUED'])
    assert.ok(str.includes(item),item);
 assert.match(str,/xref\n0 \d+\n/);
 assert.match(str,/startxref\n\d+\n%%EOF\n$/);
 const at=Number(str.match(/startxref\n(\d+)\n%%EOF/)[1]);
 assert.equal(str.slice(at,at+5),'xref\n');
 assert.equal(repairPdfEscape('Coat (BU) \\ test'),'Coat \\(BU\\) \\\\ test');
});
test('Document builder does not submit inspections or write to CrewSense/Vector',()=>{
 const fn=pure('// Downloadable, fully populated PDF.',"const PPE_REPAIR_DRAFTS_KEY=");
 assert.doesNotMatch(fn,/fetch\(|submitInspection|\.click\(|GM_xmlhttpRequest/);
});
test('Pants item detail collection waits for size after early serial and year',()=>{
 const section=pure('async function repairReadItemDetail(asset) {','// On an actual Vector equipment page');
 assert.match(section,/while\(Date\.now\(\)-start<8500\)/);
 assert.match(section,/for\(const field of fields\)/);
 assert.match(section,/lastChangeAt/);
 assert.doesNotMatch(section,/if\(Object\.values\(found\)\.some\(Boolean\)\)\{/);
 assert.match(src,/size:find\(\/\^Size\\s\*:\?\$\/i/);
});
