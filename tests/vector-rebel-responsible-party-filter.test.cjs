'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function extract(a,b){const i=script.indexOf('    '+a),j=script.indexOf('    '+b,i+1);assert.ok(i>=0&&j>i);return script.slice(i,j);}
const clean=s=>String(s??'').trim();
const key=s=>clean(s).toLowerCase().replace(/\s+/g,' ');
const finderCode=extract('async function scanPpeByResponsibleParty(personName, progress = null) {',
  'async function scanPpeOwnerSearch(owner, progress = null) {')+
  '\nreturn scanPpeByResponsibleParty;';
function harness({owner='Michael Brion',rows=[],showFilter=true,selectable=true,selectOn='mousedown'}={}){
 let now=100,open=false,selected='',applied=false,currentPage=0,clearCount=0,applyCount=0,updates=[],search={value:'BRION',isConnected:true};
 class FakeDate extends Date{static now(){return now;}}
 const chipContainer={
   querySelectorAll(){return selected?[{innerText:selected,textContent:selected}]:[];}
 };
 const input={id:'filter-equip-std-responsibleParty',value:'',
    parentElement:{parentElement:chipContainer},
    getAttribute:k=>k==='aria-controls'?'rp-listbox':null,focus(){},click(){}};
 const choose=()=>{selected=owner;input.value='';};
 const option={
    innerText:owner,textContent:owner,
    dispatchEvent(e){if(e.type==='mousedown' &&
      (selectOn==='mousedown'||selectOn==='double_toggle'))choose();},
    click(){if(selectOn==='click')choose();else if(selectOn==='double_toggle')selected='';}
 };
 const listbox={querySelectorAll:()=>selectable&&key(owner).includes(key(input.value))&&
   clean(input.value).length&&clean(input.value).length<10?[option]:[]};
 const openButton={innerText:'',getAttribute:k=>k==='aria-label'?'Open filter options':'',
    click(){open=true}};
 const clearButton={innerText:'Clear Filters',getAttribute:()=>'',click(){selected='';clearCount++}};
 const applyButton={innerText:'Apply Filters',getAttribute:()=>'',click(){applied=!!selected;open=false;currentPage=0;applyCount++}};
 const fakeDoc={
  querySelectorAll(q){
    if(q==='button,[role="button"]')return open?
      [openButton,clearButton,applyButton]:showFilter?[openButton]:[];
    if(q==='input[role="combobox"]')return open?[input]:[];
    return [];
  },
  getElementById(id){return id==='rp-listbox'&&open?listbox:null;}
 };
 const page=()=>applied?rows.slice(currentPage*10,(currentPage+1)*10):[];
 const anchors=()=>page().map((item,i)=>({item,href:'/PPE/'+i,getAttribute:()=>'/PPE/'+i}));
 const code=new Function('clean','masterNameKey','isOrganizationOrBadRosterName',
  'ensurePpeEquipmentPage','getSearchInput','nativeSetInput','sleep',
  'document','visible','uiEquals','window','MouseEvent','getPpeResultsContainer',
  'ppeLoadedRowsSnapshot','getVisiblePpeAnchors','responsiblePartyPpeRow',
  'getPaginationControl','paginationControlEnabled','waitForPpePageChange',
  'hasExplicitNoResults','visibleAssetLinksSignature','Date',finderCode);
 const f=code(clean,key,()=>false,async()=>{},()=>search,
   (el,val)=>{el.value=val;updates.push(val);},async ms=>{now+=ms;},fakeDoc,
   ()=>true,(v,target)=>clean(v).toLowerCase()===clean(target).toLowerCase(),
   {},class StrictMouseEvent {
     constructor(type, options) {
       this.type=type;
       assert.equal(type, 'mousedown');
       assert.equal(options.bubbles, true);
       assert.equal(options.cancelable, true);
       assert.equal(Object.hasOwn(options, 'view'), false,
         'Tampermonkey cross-realm window must not be passed as MouseEvent.view');
     }
   },
   ()=>({}),()=>({ready:applied&&page().length>0,
     signature:'page'+currentPage+'-'+page().map(x=>x.assetId).join(',')}),
   ()=>anchors(),a=>a.item,
   kind=>kind==='next'&&applied&&rows.length>(currentPage+1)*10?
     {click(){currentPage++;}}:null,
   v=>!!v,async()=>{},()=>applied&&rows.length===0,
   ()=>applied?'page'+currentPage+'-'+page().length:'unfiltered',
   FakeDate);
 return {run:f,record:()=>({selected,applied,clearCount,applyCount,updates,search:search.value,now})};
}
const item=(assetId,ownerName='Michael Brion',pool='300045',itemId=assetId)=>
  ({assetId,ownerName,pool,itemId,status:'In Service',type:pool==='300045'?'Bunker Coat':'SCBA Face Mask'});
test('Native Responsible Party filter returns both surname PPE and serial-number SCBA on two pages',async()=>{
 const assets=Array.from({length:16},(_,i)=>item('BRION-'+i));
 assets.push(item('E004015306F2D8FE','Michael Brion','556677'));
 const h=harness({rows:assets});
 const result=await h.run('Michael Brion');
 assert.equal(result.scope,'responsible-party-filter');
 assert.equal(result.pageCount,2);
 assert.equal(result.rowCount,17);
 assert.equal(result.items.length,17);
 assert.ok(result.items.some(x=>x.assetId==='E004015306F2D8FE'));
 assert.equal(h.record().selected,'Michael Brion');
 assert.equal(h.record().clearCount,1);
 assert.equal(h.record().applyCount,1);
 assert.equal(h.record().search,'');
 assert.ok(h.record().updates.includes('Br'));
});
test('Wrong Responsible Party result is never accepted',async()=>{
 const h=harness({rows:[item('E004015306F2D8FE','Jarred Weston','556677')]});
 await assert.rejects(h.run('Michael Brion'),/filter did not settle|No PPE assigned/);
 assert.equal(h.record().applied,true);
});
test('No exact selectable Responsible Party option means no filter is applied',async()=>{
 const h=harness({rows:[item('BRION-1')],selectable:false});
 await assert.rejects(h.run('Michael Brion'),/not confirmed selected/);
 assert.equal(h.record().applyCount,0);
});
test('Unselected React-select option is rejected before applying an unfiltered scan',async()=>{
 const h=harness({rows:[item('BRION-1')],selectOn:'none'});
 await assert.rejects(h.run('Michael Brion'),/not confirmed selected/);
 assert.equal(h.record().applyCount,0);
});
test('React-select mousedown choice must not be undone by an extra click',async()=>{
 const h=harness({rows:[item('BRION-1')],selectOn:'double_toggle'});
 const result=await h.run('Michael Brion');
 assert.equal(result.items.length,1);
 assert.equal(h.record().selected,'Michael Brion');
 assert.equal(h.record().applyCount,1);
});
test('Click-only selection falls back safely after mousedown',async()=>{
 const h=harness({rows:[item('BRION-1')],selectOn:'click'});
 const result=await h.run('Michael Brion');
 assert.equal(result.items.length,1);
 assert.equal(h.record().applyCount,1);
});
test('Cannot assume PPE ownership if filter button is missing',async()=>{
 const h=harness({rows:[item('BRION-1')],showFilter:false});
 await assert.rejects(h.run('Michael Brion'),/Filters button was not found/);
});
test('Unmapped SCBA goes to supplemental, but unmapped structural PPE blocks',async()=>{
 const code=extract('async function discoverOwnerGear(owner, modeKey, inventory) {',
  'function getGearSnapshots() {')+'\nreturn discoverOwnerGear;';
 const fn=new Function('clean','masterNameKey','getMode','getPoolType',code)(
  clean,key,()=>({templates:{'300045':'112411'}}),
  p=>p==='300045'?'Bunker Coat':'UNKNOWN');
 const inventory={source:'Vector PPE Responsible Party column',
  items:[
   item('BRION-COAT','Michael Brion','300045'),
   item('E004015306F2D8FE','Michael Brion','556677'),
   {...item('NEW-COAT','Michael Brion','500001'),type:'Bunker Coat, New Pool'}
  ],capturedAt:'2026-10-22T17:00:00Z',pageCount:2};
 const r=await fn({name:'Michael Brion'},'tour',inventory);
 assert.deepEqual(r.items.map(x=>x.assetId),['BRION-COAT']);
 assert.deepEqual(r.supplemental.map(x=>x.assetId),['E004015306F2D8FE']);
 assert.deepEqual(r.unknown.map(x=>x.assetId),['NEW-COAT']);
});
test('Live dual-cert coat/pant and wildland helmet stay visible but never block structural checks',async()=>{
 const code=extract('async function discoverOwnerGear(owner, modeKey, inventory) {',
   'function getGearSnapshots() {')+'\nreturn discoverOwnerGear;';
 const getMode=mode=>({templates:mode==='scbaTour'?{'299947':'119122'}:{'300045':'112411'}});
 const fn=new Function('clean','masterNameKey','getMode','getPoolType',code)(
   clean,key,getMode,p=>p==='300045'?'Bunker Coat':p==='299947'?'SCBA Face Mask':'UNKNOWN');
 const base={source:'Vector PPE Responsible Party column',capturedAt:'2026-10-22T21:53:00Z',pageCount:2};
 const special=[
  {...item('M-1470-0000000068','Michael Brion','299896'),type:'Dual Certification Coat, Wildland'},
  {...item('M-78047-0000154','Michael Brion','299897'),type:'Dual Certification Pant, Wildland'},
  {...item('WH4110516','Michael Brion','300006'),type:'Wildland Helmet'}
 ];
 for(const mode of ['tour','afterFire','captain']){
   const inventory={...base,items:[
    item('BRION-COAT','Michael Brion','300045'),
    item('E004015306F2D8FE','Michael Brion','299947'),
    ...special
   ]};
   const r=await fn({name:'Michael Brion'},mode,inventory);
   assert.equal(r.unknown.length,0,mode+' should not be blocked by distinct pools');
   assert.deepEqual(r.supplemental.filter(x=>special.some(y=>y.assetId===x.assetId))
     .map(x=>x.assetId),special.map(x=>x.assetId));
   assert.ok(r.items.some(x=>x.assetId==='BRION-COAT'));
   assert.ok(!r.items.some(x=>special.some(y=>y.assetId===x.assetId)),
     'nonstandard gear never submitted using a structural template');
   if(mode==='tour')assert.ok(r.items.some(x=>x.inspectionModeKey==='scbaTour'));
 }
 const mismatch={...special[0],type:'Bunker Coat'};
 const unknown={...item('NEW-COAT','Michael Brion','555999'),type:'Dual Certification Coat'};
 for(const itemToCheck of [mismatch,unknown]){
   const result=await fn({name:'Michael Brion'},'tour',{...base,items:[itemToCheck]});
   assert.equal(result.unknown.length,1,'unknown or misidentified pool must still block');
 }
});
test('Main checks do not rely on PPE prefixes or perform a full census',()=>{
 const preview=extract('async function buildPreview(modeKey, ownerInput) {',
  'async function launchMyInspectionFromAnywhere(modeKey) {');
 const crew=extract('async function scanPpeCrewOwners(owners, progress = null) {',
  'async function scanPpeOwnerInventory(progress = null) {');
 assert.match(preview,/scanPpeByResponsibleParty\(owners\[0\]\.name/);
 assert.match(crew,/scanPpeByResponsibleParty\(owner\.name/);
 assert.doesNotMatch(preview+crew,/scanPpeOwnerInventory\(/);
 assert.doesNotMatch(preview+crew,/crewPpeSearchPrefix\(/);
 assert.match(script,/OTHER ASSIGNED EQUIPMENT — NOT PART OF THIS INSPECTION/);
});
