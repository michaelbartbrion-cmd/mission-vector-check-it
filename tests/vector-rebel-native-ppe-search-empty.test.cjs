'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const s=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=s.indexOf('    function ppeNativeSearchConfirmedEmpty()');
const b=s.indexOf('    async function scanPpeOwnerSearch(',a);
assert.ok(a>0&&b>a,'Expected actual Vector native search helpers');
function factory({empty=false,visibleLinks=false,ppeActive=true,buttons=['Search'],isPpePage=true}={}){
 let clicks=0;
 const root=empty?{innerText:'No PPE item found'}:{innerText:'Select a filter'};
 const field={value:'FOX'};
 const dom={
  querySelector:sel=>sel==='main'?root:null,
  querySelectorAll:sel=>sel==='button'?buttons.map(name=>({
   innerText:name,textContent:name,disabled:false,getAttribute:()=>'',click:()=>clicks++
  })):[]
 };
 const sandbox={document:dom,
  getSearchInput:()=>field,findVectorNavigationTarget:()=>({label:'PPE'}),
  visible:()=>true,vectorControlLooksActive:()=>ppeActive,
  getVisiblePpeAnchors:()=>visibleLinks?[{}]:[],
  getPpeResultsContainer:()=>null,uiText:x=>String(x),
  isConfirmedPpeEquipmentPage:()=>isPpePage,
  uiEquals:(a,b)=>a===b};
 vm.runInNewContext(s.slice(a,b)+'\nvar __functions={empty:ppeNativeSearchConfirmedEmpty,submit:submitNativePpeSearch};',sandbox);
 return {api:sandbox.__functions,field,clicked:()=>clicks};
}
test('explicit no-result page is recognized only on native PPE tab with no real asset links',()=>{
 assert.equal(factory({empty:true}).api.empty(),true);
 assert.equal(factory({empty:false}).api.empty(),false);
 assert.equal(factory({empty:true,visibleLinks:true}).api.empty(),false);
 assert.equal(factory({empty:true,ppeActive:false}).api.empty(),false);
});
test('native PPE text Search button is clicked exactly once, never inspection buttons',()=>{
 const x=factory({buttons:['Search','Run Tour Inspection']});
 x.api.submit(x.field);
 assert.equal(x.clicked(),1);
 const duplicate=factory({buttons:['Search','Search']});
 assert.throws(()=>duplicate.api.submit(duplicate.field),/unique Search button/);
 assert.equal(duplicate.clicked(),0);
 const noBtn=factory({buttons:['Submit PPE inspection']});
 assert.throws(()=>noBtn.api.submit(noBtn.field),/unique Search button/);
 assert.equal(noBtn.clicked(),0);
 const wrongTab=factory({ppeActive:false});
 assert.throws(()=>wrongTab.api.submit(wrongTab.field),/not confirmed/);
 assert.equal(wrongTab.clicked(),0);
 const wrongPage=factory({isPpePage:false});
 assert.throws(()=>wrongPage.api.submit(wrongPage.field),/not confirmed/);
 assert.equal(wrongPage.clicked(),0);
});
test('same native one-person surname lookup actually invokes PPE Search after input mutation',()=>{
 const body=s.slice(b,s.indexOf('    // A PERSON-* identifier',b));
 assert.match(body,/nativeSetInput\(search, term\);\s*submitNativePpeSearch\(search\)/);
 assert.match(body,/masterNameKey\(item.ownerName\) === ownerKey/);
});
