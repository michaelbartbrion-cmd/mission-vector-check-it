'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const begin=script.indexOf('    async function scanPpeOwnerSearch(owner, progress = null) {');
const end=script.indexOf('    async function scanPpeOwnerInventory(progress = null) {',begin+1);
assert.ok(begin>=0&&end>begin);
const code=script.slice(begin,end)+'\nreturn scanPpeOwnerSearch;';
function testHarness(data, settings={}) {
 let ms=0;
 let search={value:settings.initialTerm||'',isConnected:true};
 let rowWaitRequirement=null;
 class FakeDate extends Date {static now(){return ms;}}
 let terms=[], visits=[];
 const rows=()=>{
   const term=search.value;
   return data[term]||[];
 };
 const anchor=(x,index)=>({
   x,
   getAttribute:()=>{
     let h=2166136261;
     for(const ch of x.assetId) h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
     return '/app/equipment/PPE/pool/300045/'+(h+1)+'/item';
   }
 });
 const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 let currentIndex=0;
 const pages=()=>{
   const raw=rows();
   return raw.slice(currentIndex*10,(currentIndex+1)*10).map(anchor);
 };
 const from=new Function('clean','masterNameKey','ensurePpeEquipmentPage','getSearchInput',
  'visibleAssetLinksSignature','nativeSetInput','ppeLoadedRowsSnapshot','hasExplicitNoResults',
  'getPpeResultsContainer','getVisiblePpeAnchors','responsiblePartyPpeRow',
  'getPaginationControl','paginationControlEnabled','waitForPpePageChange',
  'location','Date','sleep','getPoolType','document',code);
 const f=from(clean,norm,async(_progress, requireRows)=>{rowWaitRequirement=requireRows;},()=>search,
   ()=>rows().length?search.value+':'+currentIndex+':'+rows().length:'EMPTY',
   (_,term)=>{search.value=term;terms.push(term);currentIndex=0},
   ()=>({ready:rows().length>0,signature:JSON.stringify(pages().map(a=>a.x)),count:pages().length}),
   ()=>rows().length===0,()=>({}),()=>pages(),
   a=>({...a.x,pool:'300045',itemId:a.getAttribute().split('/')[6],url:'https://app.vectorcheckit.us'+a.getAttribute()}),
   kind=>kind==='next'&&rows().length>(currentIndex+1)*10?{click(){currentIndex++}}:null,
   v=>!!v,async()=>{}, {origin:'https://app.vectorcheckit.us'},
   FakeDate,async()=>{ms+=200},()=>'',{});
 return {run:f,search,terms,visits,clock:()=>ms, getRowRequirement:()=>rowWaitRequirement};
}
const michael={name:'Michael Brion',prefix:'BRION'};
const gear=(id,owner='Michael Brion')=>({assetId:id,ownerName:owner,status:'In Service',type:'Bunker Coat'});
test('My Tour searches only PPE prefix and filters Responsible Party, never full name or entire roster',async()=>{
 const h=testHarness({'Michael Brion':[],BRION:[
    gear('BRION-COAT'),gear('BRION-PANTS'),gear('UNRELATED','Robert Brooks')
 ]},{initialTerm:'Michael Brion'});
 const r=await h.run(michael);
 assert.equal(r.scope,'verified-owner-search');
 assert.deepEqual(r.searched,['BRION']);
 assert.deepEqual(r.items.map(i=>i.assetId),['BRION-COAT','BRION-PANTS']);
 assert.deepEqual(h.terms,['BRION']);
 assert.equal(h.search.value,'BRION');
 assert.equal(h.getRowRequirement(),false);
 assert.ok(r.pageCount<=2);
});
test('Exact Responsible Party matching prevents another member gear from inclusion',async()=>{
 const h=testHarness({'Michael Brion':[gear('A','Robert Brooks'),gear('B','Michael Brion')],
 BRION:[gear('B','Michael Brion'),gear('X','Ronald Brion')]});
 const r=await h.run(michael);
 assert.deepEqual(r.items.map(x=>x.assetId),['B']);
});
test('No matching owner blocks run instead of scanning all PPE',async()=>{
 const h=testHarness({'Michael Brion':[],BRION:[gear('M-1470','Christopher Hoogerwerf')]});
 await assert.rejects(h.run(michael),/No PPE could be verified/);
});
test('Search result too broad cannot silently become department crawl',async()=>{
 const large=Array.from({length:170},(_,i)=>gear('ITEM-'+i,'Someone Else'));
 const h=testHarness({'Michael Brion':[],BRION:large});
 await assert.rejects(h.run(michael),/too many results|exceeded 15 pages/);
});
test('Personal inspection routes only through scoped owner search and uses current profile',()=>{
 assert.match(script,/const personalMode = modeKey === 'tour' \|\| modeKey === 'afterFire'/);
 assert.match(script,/await scanPpeByResponsibleParty\(owners\[0\]\.name, message => setStatus\(message\)\)/);
 assert.match(script,/name: config\.inspectorName,/);
 assert.match(script,/const searchTerms = \[ownerPrefix\]/);
 assert.match(script,/ensurePpeEquipmentPage\(message => setStatus\(message\), false\)/);
 assert.match(script,/await ensurePpeEquipmentPage\(progress, false\)/);
 assert.match(script,/await scanPpeCrewOwners\(owners, message => setStatus\(message\)\)/);
});
