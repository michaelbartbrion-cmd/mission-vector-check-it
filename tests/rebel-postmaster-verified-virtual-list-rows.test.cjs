'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start,'Expected native parser');return source.slice(start,end)}
const candidate=between('function candidateRows(){','function displayedReceived(');
const parse=between('function parseRow(','function isFolderTreeNode(');
function row({role='listitem',id='AgAAA5zpZsgCAAAIy8tVwgAAA',text='Example Sender\nSubject Example\nPreview',scroll=true,tree=false,inMail=false,visible=true,explicitId='',isReading=false}={}){
 const attrs={id,role,'data-itemid':explicitId};
 return {
  attrs,role,scroll,tree,inMail,visible,isReading,innerText:text,textContent:text,className:'jGG6V',
  matches:selector=>selector.includes('[role="listitem"][id]')&&['listitem','option'].includes(role)&&!!id,
  closest:selector=>selector.includes('[role="tree"]')?tree?{}:null:
    selector.includes('customScrollBar')?scroll?{}:null:
    selector.includes('listbox')?inMail?{}:null:null,
  querySelector:()=>null
 };
}
function harness(elements){
 const ctx={
  document:{querySelectorAll:()=>elements},
  visible:el=>el.visible,
  findReadingPane:()=>null,
  clean:x=>String(x||'').replace(/\s+/g,' ').trim(),
  rawText:x=>String(x||''),
  attr:(el,key)=>el?.attrs?.[key]||'',
  symbolOnly:()=>false,timeLike:()=>false,initialBadge:()=>false,
  isoMaybe:()=>undefined,displayedReceived:()=>undefined,
  hash:x=>'fallback-'+x.length,
  location:{href:'https://outlook.cloud.microsoft/mail/'}
 };
 vm.createContext(ctx);
 vm.runInContext(candidate+'\n'+parse+'\nglobalThis.scan=candidateRows;globalThis.parse=parseRow;',ctx);
 return ctx;
}
test('new Outlook listitem with durable opaque id inside native scrollbar is eligible',()=>{
 const el=row();
 const h=harness([el]);const got=h.scan();
 assert.equal(got.length,1);
 const parsed=h.parse(got[0],0);
 assert.equal(parsed._strongId,true);
 assert.equal(parsed.messageKey,'outlook:AgAAA5zpZsgCAAAIy8tVwgAAA');
 assert.equal(parsed.senderName,'Example Sender');
 assert.equal(parsed.subject,'Subject Example');
 assert.equal(parsed.captureLevel,'list');
});
test('navigation tree items never become emails even when they have an ID',()=>{
 const h=harness([row({tree:true})]);assert.equal(h.scan().length,0);
});
test('unscoped and short-ID elements fail closed',()=>{
 const h=harness([row({scroll:false}),row({id:'short'}),row({id:''}),row({visible:false})]);
 assert.equal(h.scan().length,0);
});
test('legacy explicit native data-itemid remains supported without scrollbar evidence',()=>{
 const el=row({role:'option',id:'',scroll:false,explicitId:'legacy-verified-id'});
 const h=harness([el]);
 assert.equal(h.scan().length,1);
 assert.equal(h.parse(h.scan()[0],0).messageKey,'outlook:legacy-verified-id');
});
test('non-message text alone does not certify a new mail item',()=>{
 const h=harness([row({id:'',text:'Account manager\nProfile settings',scroll:true})]);
 assert.equal(h.scan().length,0);
});
