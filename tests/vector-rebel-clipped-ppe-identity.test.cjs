'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=src.indexOf('    function resolveClippedPpeNameFromVerifiedDetail(item) {');
const end=src.indexOf('    let identityElementCache =',start);
assert.ok(start>=0&&end>start,'clipped PPE identity recovery helper exists');
const code=src.slice(start,end)+'\nreturn resolveClippedPpeNameFromVerifiedDetail;';
const clean=v=>String(v??'').trim();
const type=v=>clean(v).toLowerCase();
function create({serial='10948322',title='Bunker Coat: BALDREE-10948322-FL',
  correctRoute=true,headings=null}={}){
 const named=(headings||[title]).map(textContent=>({textContent,closest:()=>null}));
 const doc={querySelectorAll:()=>named};
 return new Function('clean','isAssetPageFor','repairReadDetailDocument','document',
  'visible','PANEL_ID','OVERLAY_ID','uiText','normalizedPpeTypeText',code)(
    clean,()=>correctRoute,()=>({serial}),doc,()=>true,'panel','overlay',
    clean,type
  );
}
const target={assetId:'BALDREE-10948322-F...',pool:'300045',
  itemId:'4604890',ownerName:'Michael Baldree',type:'Bunker Coat'};
test('Baldree reported truncated PPE Name is restored from exact heading, serial and route',()=>{
 const fn=create();
 assert.equal(fn(target),'BALDREE-10948322-FL');
 assert.equal(target.assetId,'BALDREE-10948322-F...');
 assert.equal(target.ownerName,'Michael Baldree');
});
test('wrong serial, wrong detail route and non-truncated values cannot be recovered',()=>{
 assert.equal(create({serial:'99999999'})(target),'');
 assert.equal(create({correctRoute:false})(target),'');
 assert.equal(create()({...target,assetId:'BALDREE-10948322-FL'}),'');
});
test('a matching prefix alone cannot verify different PPE identity',()=>{
 assert.equal(create({title:'Bunker Coat: BALDREE-10948322-XL'})(target),'');
 assert.equal(create({title:'Bunker Coat: SOMEONE-10948322-FL'})(target),'');
 assert.equal(create({title:'Bunker Pant: BALDREE-10948322-FL'})(target),'');
});
test('multiple matching title identities remain ambiguous and blocked',()=>{
 const fn=create({headings:['Bunker Coat: BALDREE-10948322-FL',
   'Bunker Coat: BALDREE-10948322-FR']});
 assert.equal(fn(target),'');
});
test('does not infer omitted PPE Name without its serial and full item heading',()=>{
 assert.equal(create({serial:''})(target),'');
 assert.equal(create({title:'Serial Number: 10948322'})(target),'');
 assert.equal(create({title:'Bunker Coat: BALDREE-10948322-F...'})(target),'');
});
test('inspection flow checks restored full name before persisting, never bypasses identity check',()=>{
 const block=src.slice(src.indexOf('    async function openInspectionForCurrentAsset(run) {'),
   src.indexOf('    async function ',src.indexOf('    async function openInspectionForCurrentAsset(run) {')+15));
 assert.ok(block.includes('resolveClippedPpeNameFromVerifiedDetail(item)'));
 assert.ok(block.indexOf('verifyExpectedAssetPage(verifiedItem)') <
   block.indexOf('item.assetId = restoredName'));
 assert.ok(block.indexOf('if (!identityVerified)') <
   block.indexOf('item.assetId = restoredName'));
 assert.match(block,/item\.assetId = restoredName;\s*saveRun\(run\)/);
 assert.match(block,/stopRun\(/);
});
