'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const s=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=s.indexOf('    function ppeNativeSearchConfirmedEmpty()');
const b=s.indexOf('    async function scanPpeOwnerSearch(',a);
assert.ok(a>0&&b>a,'Expected actual Vector native search helpers');
function factory({empty=false,visibleLinks=false,ppeActive=true,buttons=['Search'],isPpePage=true}={}){
 let clicks=0,focuses=0;
 const events=[];
 const root=empty?{innerText:'No PPE item found'}:{innerText:'Select a filter'};
 const field={value:'FOX',focus:()=>focuses++,dispatchEvent:event=>{
  events.push({type:event.type,key:event.key});return true;
 }};
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
  KeyboardEvent:class{constructor(type,opts){this.type=type;this.key=opts.key;}},
  uiEquals:(a,b)=>a===b};
 vm.runInNewContext(s.slice(a,b)+'\nvar __functions={empty:ppeNativeSearchConfirmedEmpty,submit:submitNativePpeSearch};',sandbox);
 return {api:sandbox.__functions,field,clicked:()=>clicks,
  focused:()=>focuses,events:()=>events};
}
test('explicit no-result page is recognized only on native PPE tab with no real asset links',()=>{
 assert.equal(factory({empty:true}).api.empty(),true);
 assert.equal(factory({empty:false}).api.empty(),false);
 assert.equal(factory({empty:true,visibleLinks:true}).api.empty(),false);
 assert.equal(factory({empty:true,ppeActive:false}).api.empty(),false);
});
test('native PPE search uses the unique Search button, never an inspection button',()=>{
 const x=factory({buttons:['Search','Run Tour Inspection']});
 x.api.submit(x.field);
 assert.equal(x.clicked(),1);
 assert.equal(x.events().length,0,'explicit button should not also press Enter');
 const duplicate=factory({buttons:['Search','Search']});
 assert.throws(()=>duplicate.api.submit(duplicate.field),/ambiguous Search buttons/);
 assert.equal(duplicate.clicked(),0);
 const wrongTab=factory({ppeActive:false});
 assert.throws(()=>wrongTab.api.submit(wrongTab.field),/not confirmed/);
 assert.equal(wrongTab.clicked(),0);
 const wrongPage=factory({isPpePage:false});
 assert.throws(()=>wrongPage.api.submit(wrongPage.field),/not confirmed/);
 assert.equal(wrongPage.clicked(),0);
});
test('live Vector magnifier-only PPE field submits Enter on equipment search only',()=>{
 const x=factory({buttons:['Submit PPE inspection','Filters']});
 x.api.submit(x.field);
 assert.equal(x.clicked(),0,'must never click official inspection or filter controls');
 assert.equal(x.focused(),1,'confirmed search input focused');
 assert.deepEqual(x.events(),[{type:'keydown',key:'Enter'},
  {type:'keyup',key:'Enter'}]);
});
test('missing standalone search button does not weaken native PPE identity gate',()=>{
 const x=factory({buttons:[],ppeActive:false});
 assert.throws(()=>x.api.submit(x.field),/not confirmed/);
 assert.equal(x.events().length,0);
});
test('same native one-person surname lookup actually invokes PPE Search after input mutation',()=>{
 const body=s.slice(b,s.indexOf('    // A PERSON-* identifier',b));
 assert.match(body,/nativeSetInput\(search, term\);\s*submitNativePpeSearch\(search\)/);
 assert.match(body,/masterNameKey\(item.ownerName\) === ownerKey/);
});

test('actual native search__icon inside search__container is used even when not an HTML button',()=>{
 const x=factory({buttons:['Submit PPE inspection']});
 let clicked=0;
 const icon={disabled:false,getAttribute:()=>'',classList:{contains:v=>v==='search__icon'},click:()=>clicked++};
 x.field.closest=sel=>sel==='.search__container'?{querySelectorAll:()=>[icon]}:null;
 x.api.submit(x.field);
 assert.equal(clicked,1);assert.equal(x.events().length,0);assert.equal(x.clicked(),0);
});
test('ambiguous scoped magnifier controls stop without any native clicks',()=>{
 const x=factory({buttons:['Search']});
 let clicked=0;
 const icon=()=>({disabled:false,getAttribute:()=>'',classList:{contains:v=>v==='search__icon'},click:()=>clicked++});
 x.field.closest=()=>({querySelectorAll:()=>[icon(),icon()]});
 assert.throws(()=>x.api.submit(x.field),/ambiguous Search buttons/);
 assert.equal(clicked,0);assert.equal(x.clicked(),0);
});
