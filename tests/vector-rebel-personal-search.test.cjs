'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const begin=script.indexOf('    async function scanPpeOwnerSearch(owner, progress = null) {');
const end=script.indexOf('    async function scanPpeOwnerInventory(progress = null) {',begin+1);
assert.ok(begin>=0&&end>begin);
const code=script.slice(begin,end)+'\nreturn scanPpeOwnerSearch;';
function testHarness(data, settings={}) {
 let ms=0;
 let search={value:'',isConnected:true};
 let terms=[], visits=[];
 const rows=()=>{
   const term=search.value;
   return data[term]||[];
 };
 const anchor=(x,index)=>({
   x,
   getAttribute:()=>'/app/equipment/PPE/pool/300045/'+(index+1)+'/item'
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
 const f=from(clean,norm,async()=>{},()=>search,
   ()=>rows().length?search.value+':'+currentIndex+':'+rows().length:'EMPTY',
   (_,term)=>{search.value=term;terms.push(term);currentIndex=0},
   ()=>({ready:rows().length>0,signature:JSON.stringify(pages().map(a=>a.x)),count:pages().length}),
   ()=>rows().length===0,()=>({}),()=>pages(),
   a=>({...a.x,pool:'300045',itemId:a.getAttribute().split('/')[5],url:'https://app.vectorcheckit.us'+a.getAttribute()}),
   kind=>kind==='next'&&rows().length>(currentIndex+1)*10?{click(){currentIndex++}}:null,
   v=>!!v,async()=>{}, {origin:'https://app.vectorcheckit.us'},
   {now:()=>ms},async()=>{ms+=200},()=>'',{});
 return {run:f,search,terms,visits,clock:()=>ms};
}
const michael={name:'Michael Brion',prefix:'BRION'};
const gear=(id,owner='Michael Brion')=>({assetId:id,ownerName:owner,status:'In Service',type:'Bunker Coat'});
test('My Tour search checks full name then PPE prefix; does not crawl other crew',async()=>{
 const h=testHarness({'Michael Brion':[],BRION:[
    gear('BRION-COAT'),gear('BRION-PANTS'),gear('UNRELATED','Robert Brooks')
 ]});
 const r=await h.run(michael);
 assert.equal(r.scope,'verified-owner-search');
 assert.deepEqual(r.searched,['Michael Brion','BRION']);
 assert.deepEqual(r.items.map(i=>i.assetId),['BRION-COAT','BRION-PANTS']);
 assert.deepEqual(h.terms.slice(0,2),['Michael Brion','BRION']);
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
 const h=testHarness({'Michael Brion':large,BRION:[]});
 await assert.rejects(h.run(michael),/too many results|exceeded 15 pages/);
});
test('Personal inspection routes only through scoped owner search and uses current profile',()=>{
 assert.match(script,/const personalMode = modeKey === 'tour' \|\| modeKey === 'afterFire'/);
 assert.match(script,/await scanPpeOwnerSearch\(owners\[0\], message => setStatus\(message\)\)/);
 assert.match(script,/name: config\.inspectorName,\s*prefix: config\.selfPrefix/);
 assert.match(script,/const freshInventory = await scanPpeOwnerInventory\(message => setStatus\(message\)\)/);
});
