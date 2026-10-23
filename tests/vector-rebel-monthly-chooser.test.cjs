'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const between=(a,b)=>{
 const i=src.indexOf('    '+a),j=src.indexOf('    '+b,i+1);
 assert.ok(i>=0&&j>i,a+' boundaries found');
 return src.slice(i,j);
};
class Node {
 constructor(tag,text='',children=[],opts={}){
   this.tagName=tag.toUpperCase();this.ownText=text;this.children=children;
   this.parentElement=null;this.role=opts.role||'';
   this.onclick=opts.clickable?()=>{this.clicked++}:null;
   this.clicked=0;this.tabIndex=-1;this.disabled=false;
   this.rect=opts.rect||{width:450,height:70};
   for(const child of children)child.parentElement=this;
 }
 get innerText(){return [this.ownText,...this.children.map(x=>x.innerText)].filter(Boolean).join('\n')}
 get textContent(){return this.innerText}
 getBoundingClientRect(){return this.rect}
 getAttribute(key){return key==='role'?this.role:null}
 querySelectorAll(){const out=[];const walk=n=>{for(const c of n.children){out.push(c);walk(c)}};walk(this);return out}
 click(){this.clicked++;if(this.onclick)this.onclick()}
 contains(n){return n===this||this.querySelectorAll().includes(n)}
}
function chooser({title='Select Inspection…',cancelTag='div',monthlyText='Captain’s Monthly PPE Routine Inspection'}={}){
 const heading=new Node('h3',title,[],{rect:{width:270,height:42}});
 const card=(name)=>new Node('div','',[
  new Node('span',name,[],{rect:{width:340,height:20}}),
  new Node('small','CHECKLIST',[],{rect:{width:110,height:16}})
 ],{clickable:true,rect:{width:494,height:70}});
 const cards=[
   card('Tour PPE Routine Inspection'),
   card('PPE Routine Inspection (After Every Fire)'),
   card(monthlyText)
 ];
 const cancel=new Node(cancelTag,'Cancel',[],{role:cancelTag==='div'?'button':'',rect:{width:487,height:32}});
 const modal=new Node('div','',[heading,...cards,cancel],{rect:{width:520,height:420}});
 const document={querySelectorAll:()=>modal.querySelectorAll()};
 const visible=()=>true;
 const uiText=x=>String(x??'').replace(/[\u2018\u2019\u201B\u2032\u02BC]/g,"'")
   .replace(/[\u201C\u201D]/g,'"').replace(/\s+/g,' ').trim();
 const chooserText=new Function('uiText',between('function chooserText(el) {',
   'function findChooserRoot() {')+'\nreturn chooserText;')(uiText);
 const rootFn=new Function('document','visible','chooserText',between('function findChooserRoot() {',
   'function findInspectionCardInChooser(modeTitle) {')+'\nreturn findChooserRoot;')(document,visible,chooserText);
 const cardFn=new Function('findChooserRoot','visible','uiText','chooserText','getComputedStyle',
    between('function findInspectionCardInChooser(modeTitle) {','function setTextareaValue(textarea, value) {')+
    '\nreturn findInspectionCardInChooser;')(
      rootFn,visible,uiText,chooserText,el=>({cursor:el.onclick?'pointer':'default'}));
 return {modal,cards,rootFn,cardFn};
}
test('Screenshot: exact Captain Monthly option found in three-card Vector modal',()=>{
 const h=chooser();
 assert.equal(h.rootFn(),h.modal);
 const selected=h.cardFn("Captain's Monthly PPE Routine Inspection");
 assert.equal(selected,h.cards[2]);
 assert.notEqual(selected,h.cards[0]);
 selected.click();
 assert.equal(h.cards[2].clicked,2); // method + onclick callback, only correct card invoked
 assert.equal(h.cards[0].clicked,0);
});
test('Chooser recognizes three-dot and Unicode ellipsis, button or role=button Cancel',()=>{
 for(const title of ['Select Inspection...','Select Inspection…']){
   for(const cancelTag of ['button','div']){
     const h=chooser({title,cancelTag});
     assert.equal(h.rootFn(),h.modal);
     assert.equal(h.cardFn('Tour PPE Routine Inspection'),h.cards[0]);
     assert.equal(h.cardFn('PPE Routine Inspection (After Every Fire)'),h.cards[1]);
   }
 }
});
test('Absent exact Captain card never selects similar Tour or After Fire checklist',()=>{
 const h=chooser({monthlyText:'UNRELATED checklist'});
 assert.equal(h.cardFn("Captain's Monthly PPE Routine Inspection"),null);
});
test('Captain chooser failure is explicit and does not click another item or create a second draft',()=>{
 const flow=between('async function openInspectionForCurrentAsset(run) {','async function resumeRun() {');
 assert.match(flow,/chooser = await waitFor\(findChooserRoot, 15000\)/);
 assert.match(flow,/the Select Inspection popup could not be recognized/);
 assert.match(flow,/card = await waitFor\(\(\) => findInspectionCardInChooser\(mode.title\), 15000\)/);
 assert.match(flow,/the exact "\$\{mode.title\}" card could not be identified/);
 assert.match(flow,/No option was clicked/);
 assert.match(flow,/saveRun\(run\); \/\/ persist before the click it authorizes\s*startButton.click\(\)/);
});
