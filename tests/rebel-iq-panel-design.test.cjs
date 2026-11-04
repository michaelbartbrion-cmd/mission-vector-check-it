'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const vector=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const begin=source.indexOf('  const notify = (message, error = false) => {');
const end=source.indexOf('  function begin(kind) {',begin);
assert.ok(begin>0&&end>begin,'isolated complete Rebel IQ panel code');
function element(tagName) {
  return {
    tagName:tagName.toUpperCase(),children:[],attributes:{},style:{cssText:'',display:'',color:''},
    parentElement:null,id:'',textContent:'',title:'',href:'',innerHTML:'',
    append(...nodes) {
      for(const node of nodes){
        if(node.parentElement)node.parentElement.children=
          node.parentElement.children.filter(c=>c!==node);
        node.parentElement=this;this.children.push(node);
      }
    },
    appendChild(node){this.append(node);return node;},
    setAttribute(name,value){this.attributes[name]=String(value)},
    getAttribute(name){return this.attributes[name]},
    click(){this.onclick?.()}
  };
}
function walk(node) {
  return [node,...node.children.flatMap(walk)];
}
function harness(){
  const invoked={daily:0,weekly:0,ropes:0},body=element('body');
  const document={
    body,createElement:element,
    getElementById:()=>null
  };
  const code='let label, detail, menu, root, rcStatusEl, opened=false;\n'+
    source.slice(begin,end)+
    '\nmakeUi(); return {root,menu,detail,rcStatusEl};';
  const factory=new Function('document','IQ_VERSION','PANEL','rebelStarbirdIcon',
    'readIqErrors','setRcStatus','t504Visible','readRopes','sessionStorage',
    'ROPE_RESULT','RESULT','ROPE_TASKS','begin','beginRopes',code);
  const data=factory(
    document,'0.1.7','rebel-iq-t504-panel','<img alt="" src="data:image/png;base64,FAKE" />',
    ()=>[],()=>{},()=>true,()=>null,{getItem:()=>null},
    'ropeResult','normalResult',[],
    kind=>{invoked[kind]++},()=>{invoked.ropes++}
  );
  return {...data,body,invoked};
}
test('Rebel IQ uses Vector Rebel navy header, white 430px card, and two-column actions',()=>{
  const h=harness();
  const nodes=walk(h.body);
  const header=nodes.find(el=>el.tagName==='DIV'&&el.style.cssText.includes('background:#153e5c;color:#fff'));
  const actions=nodes.find(el=>el.getAttribute('data-rebel-iq-actions')==='1');
  assert.ok(header,'navy header present');
  assert.ok(h.menu.style.cssText.includes('width:430px'));
  assert.ok(h.menu.style.cssText.includes('border:1px solid #cbd9e2'));
  assert.ok(h.menu.style.cssText.includes('border-radius:12px'));
  assert.ok(actions.style.cssText.includes('grid-template-columns:1fr 1fr'));
  assert.ok(vector.includes('background:#153e5c;color:#fff'));
  assert.ok(vector.includes('grid-template-columns:1fr 1fr'));
  const title=nodes.find(el=>el.textContent==='Rebel IQ v0.1.7');
  const subtitle=nodes.find(el=>el.textContent==='T504  ·  This is the way.');
  assert.ok(title&&subtitle,'same title/subtitle hierarchy as Vector Rebel');
});
test('Exactly four concise actions route to original daily, weekly and three-rope workflows',()=>{
  const h=harness();
  const actions=walk(h.body).find(el=>el.getAttribute('data-rebel-iq-actions')==='1');
  assert.deepEqual(actions.children.map(x=>x.textContent),
    ['Daily Tour','Weekly Check','Rope Checks ×3','Check for Update']);
  for(let i=0;i<3;i++)actions.children[i].click();
  assert.deepEqual(h.invoked,{daily:1,weekly:1,ropes:1});
  const update=actions.children[3];
  assert.equal(update.tagName,'A');
  assert.equal(update.target,'_blank');
  assert.equal(update.rel,'noopener noreferrer');
  assert.equal(update.href,
    'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-iq.user.js');
});
test('One original Starbird toggles between 54px floating corner and 43px header minimize',()=>{
  const h=harness();
  let buttons=walk(h.body).filter(el=>el.tagName==='BUTTON'&&el.innerHTML.includes('data:image/png'));
  assert.equal(buttons.length,1);
  const toggle=buttons[0];
  assert.equal(h.menu.style.display,'none');
  assert.ok(toggle.style.cssText.includes('width:54px;height:54px'));
  assert.equal(toggle.getAttribute('aria-label'),'Open Rebel IQ');
  toggle.click();
  assert.equal(h.menu.style.display,'block');
  assert.ok(toggle.style.cssText.includes('width:43px;height:43px'));
  assert.equal(toggle.getAttribute('aria-label'),'Minimize Rebel IQ');
  assert.equal(toggle.parentElement.style.cssText.includes('background:#153e5c'),true);
  toggle.click();
  assert.equal(h.menu.style.display,'none');
  assert.ok(toggle.style.cssText.includes('width:54px;height:54px'));
  assert.equal(toggle.parentElement,h.root);
  buttons=walk(h.body).filter(el=>el.tagName==='BUTTON'&&el.innerHTML.includes('data:image/png'));
  assert.equal(buttons.length,1,'never duplicates the fleet icon');
});
test('Compact footer retains safety notice, error status and Rebel Command reporting text',()=>{
  const h=harness();
  const nodes=walk(h.body);
  assert.ok(nodes.some(el=>el.textContent==='Drafts only. Physically verify every item before submitting.'));
  assert.equal(h.detail.getAttribute('role'),'status');
  assert.equal(h.detail.textContent,'Ready. Choose a check.');
  assert.ok(h.rcStatusEl.style.cssText.includes('font-size:10px'));
  assert.ok(source.includes("rcStatusEl.textContent = 'Rebel Command: ' + message"));
  assert.ok(source.includes("verified.save.click()"));
  assert.ok(source.includes("form.save.click()"));
  assert.ok(!source.includes("form.submit.click()"));
});
