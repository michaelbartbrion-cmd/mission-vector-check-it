'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function extract(a,b){const i=script.indexOf('    '+a),j=script.indexOf('    '+b,i+1);assert.ok(i>=0&&j>i);return script.slice(i,j);}
const clean=s=>String(s??'').trim();
const key=s=>clean(s).toLowerCase().replace(/\s+/g,' ');
const finderCode=extract('async function scanPpeByResponsibleParty(personName, progress = null) {',
  'async function scanPpeOwnerSearch(owner, progress = null) {')+
  '\nreturn scanPpeByResponsibleParty;';
function harness({owner='Michael Brion',rows=[],showFilter=true,selectable=true,wrongOwner=false}={}){
 let now=100,open=false,selected='',applied=false,currentPage=0,clearCount=0,applyCount=0,updates=[],search={value:'BRION',isConnected:true};
 class FakeDate extends Date{static now(){return now;}}
 const input={id:'filter-equip-std-responsibleParty',value:'',
    getAttribute:k=>k==='aria-controls'?'rp-listbox':null,focus(){}};
 const option={
    innerText:owner,textContent:owner,
    dispatchEvent(){},
    click(){selected=owner;input.value='';}
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
 assert.ok(h.record().updates.includes('Brion'));
});
test('Wrong Responsible Party result is never accepted',async()=>{
 const h=harness({rows:[item('E004015306F2D8FE','Jarred Weston','556677')]});
 await assert.rejects(h.run('Michael Brion'),/filter did not settle|No PPE assigned/);
 assert.equal(h.record().applied,true);
});
test('No exact selectable Responsible Party option means no filter is applied',async()=>{
 const h=harness({rows:[item('BRION-1')],selectable:false});
 await assert.rejects(h.run('Michael Brion'),/not an exact selectable option/);
 assert.equal(h.record().applyCount,0);
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
