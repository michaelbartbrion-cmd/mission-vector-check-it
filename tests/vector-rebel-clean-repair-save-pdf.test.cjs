'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const pure=(start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return src.slice(a,b);};
const rows=['Primary Pant','Primary Coat','Primary Gloves','Primary Hood',
 'Secondary Pant','Secondary Coat','Secondary Gloves','Secondary Hood','Helmet','Helmet (Personal)','Boots'];
const asset=(name,code='FL')=>({assetId:name+'-'+code,pool:'300045',itemId:'4604970',ownerName:'Michael Brion',url:'https://app.vectorcheckit.us/app/equipment/PPE/pool/300045/4604970/item',type:'Bunker Pant'});
const form=(name='Michael Brion')=>({
 originalName:name,name,date:'2026-10-29',idNumber:'411',shift:'C',pickupStation:'4',
 deliveryStation:'4',pickupBy:'Kim',pickupDate:'2026-11-02',
 returnedBy:'Nolan',returnedDate:'2026-11-04',
 sourceItems:[asset('BRION-10240582','FL')],
 items:rows.map((row,i)=>i===0?{asset:asset('BRION-10240582','FL'),serial:'10240582',
   size:'44',manufacture:'2019',issues:'Seam check'}:{asset:null,serial:'',size:'',manufacture:'',issues:''})
});
const memory={};
const fn=pure('const PPE_REPAIR_DRAFTS_KEY=','function showPpeCleanRepairForm() {');
const drafts=new Function('PPE_REPAIR_ROWS','loadJSON','saveJSON','masterNameKey','repairPersistPersonDefaults','repairSlotFromAsset',
 fn+';return {repairPersistDraft,repairRestoreDraft,repairAssetKey};')(
 rows,(k,def)=>memory[k]||def,(k,v)=>memory[k]=v,v=>String(v).toLowerCase(),()=>{},
 a=>({asset:a,serial:a.serial||'',size:a.size||'',manufacture:'',issues:''})
);
const official=pure('const REPAIR_OFFICIAL_LOGO_BASE64=','const PPE_REPAIR_DRAFTS_KEY=');
const {repairPdfDocument,repairPdfOfficialPaint,repairPdfEscape}=new Function('PPE_REPAIR_ROWS',official+
 ';return {repairPdfDocument,repairPdfOfficialPaint,repairPdfEscape};')(rows);

test('Save Info persists all top fields and row corrections, restoring only verified owned assets',()=>{
 const first=form();first.items[0].size='44';first.items[0].issues='Needs seam repair';
 assert.match(drafts.repairPersistDraft([first]),/^20\d\d-/);
 assert.ok(memory.vr_ppe_clean_repair_saved_info_v1['michael brion']);
 const blank=form();blank.date='2026-10-30';blank.pickupStation='';blank.items[0].size='';
 assert.match(drafts.repairRestoreDraft(blank),/Saved form restored/);
 assert.equal(blank.date,'2026-10-29');
 assert.equal(blank.pickupStation,'4');
 assert.equal(blank.items[0].size,'44');
 assert.equal(blank.items[0].issues,'Needs seam repair');
 const unassigned=form();unassigned.sourceItems=[];
 assert.match(drafts.repairRestoreDraft(unassigned),/no longer assigned/);
 assert.equal(unassigned.items[0].issues,'');
});
test('Save Info, Save as PDF, editable Excel controls stay visible',()=>{
 assert.match(src,/makeButton\('Save Info'/);
 assert.match(src,/makeButton\('Save as PDF'/);
 assert.match(src,/footer\.style\.cssText\+='position:sticky;top:0/);
 assert.match(src,/saveInfoBtn\.onclick=\(\)=>/);
 assert.match(src,/pdfBtn\.onclick=\(\)=>/);
 assert.match(src,/repairPersistDraft\(forms\)/);
 assert.match(src,/anchor\.download='PPE_Clean_and_Repair_/);
});
test('PDF matches the official FMFD page, logo, customer table and 11 source rows',async()=>{
 const people=[form(),form('Jared Weston')];
 const data=Buffer.from(await repairPdfDocument(people).arrayBuffer());
 const pdf=data.toString();
 assert.ok(pdf.startsWith('%PDF-1.4\n'));
 assert.equal((pdf.match(/\/Type \/Page\b/g)||[]).length,2);
 assert.match(pdf,/\/MediaBox \[0 0 612 792\]/);
 assert.match(pdf,/\/FMFDLogo/);
 assert.match(pdf,/\/Filter \[\/ASCIIHexDecode \/DCTDecode\]/);
 assert.match(pdf,/97\.97 0 0 83\.50 489\.80 695\.20 cm \/FMFDLogo Do/);
 assert.match(pdf,/PPE CLEAN AND REPAIR FORM/);
 assert.match(pdf,/CUSTOMER INFORMATION/);
 assert.match(pdf,/PPE ITEMS SENT IN/);
 assert.match(pdf,/Flower Mound Fire Dept/);
 assert.match(pdf,/Preferred Station delivery/);
 assert.ok(pdf.includes('Helmet '+String.raw`\(Personal\)`));
 assert.match(pdf,/Primary Pant/);
 assert.match(pdf,/Secondary Coat/);
 assert.match(pdf,/Pick-up By/);
 assert.match(pdf,/Returned Date/);
 for(const part of ['Michael Brion','Jared Weston','10240582','2019','44','Seam check'])
    assert.ok(pdf.includes(part),part);
 assert.match(pdf,/xref\n0 \d+\n/);
 const offset=Number(pdf.match(/startxref\n(\d+)\n%%EOF/)[1]);
 assert.equal(pdf.slice(offset,offset+5),'xref\n');
 assert.equal(repairPdfEscape('Coat (BU) \\ test'),'Coat \\(BU\\) \\\\ test');
});
test('PDF is generated locally, never submitting an inspection or equipment edit',()=>{
 assert.doesNotMatch(official,/fetch\(|GM_xmlhttpRequest|submitInspection|\.click\(/);
 assert.match(src,/repairPersistDraft\(forms\)/);
});
test('Official template coordinates preserve both original columns and row geometry',()=>{
 const code=repairPdfOfficialPaint(form());
 assert.match(code,/18 540\.7199999999999 561 38\.08/);
 assert.match(code,/18 540\.72 m 579 540\.72 l/);
 assert.match(code,/141 578\.8 m/);
 assert.match(code,/287 578\.8 m/);
 assert.match(code,/331 578\.8 m/);
 assert.match(code,/399 578\.8 m/);
 assert.match(code,/579 578\.8 m/);
 assert.match(code,/Seam check/);
});
