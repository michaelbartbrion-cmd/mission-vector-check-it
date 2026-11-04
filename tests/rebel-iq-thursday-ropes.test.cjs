'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const injected=src.replace(/\}\)\(\);\s*$/,[
  'globalThis.__ropeTest={ROPE_TASKS,beginRopes,readRopes,runRopes,',
  'validateRopeForm,ropeSavedOnGroup,ROPE_KEY,ROPE_RESULT};',
  '})();'
].join('\n'));
assert.notEqual(injected,src,'test hooks inject into VM only');
function harness(){
  const saved=new Set(),forms=new Map(),session=new Map();
  const stats={navigation:[],formClicks:[],submitClicks:0,confirms:0};
  let current=null;
  const clean=x=>String(x??'').trim();
  const body={innerText:'63000-13(T504)',parentElement:null};
  const visible=node=>{node.getClientRects=()=>[1];node.closest=()=>null;return node;};
  const makeQuestion=(number,name)=>({
    innerText:number+'. '+name+' *\n',parentElement:body,closest:()=>null
  });
  const doc={
    body,
    getElementById:()=>({}), // Avoid UI setup; test only real form workflow.
    querySelectorAll(selector){
      if(selector==='input[type="radio"]')return current?.radios||[];
      if(selector==='[role="radio"]')return [];
      if(selector==='textarea')return [];
      if(selector==='input[type="checkbox"]')return current?.checks||[];
      if(selector==='button')return current?.buttons||[];
      if(selector==='a,[role="link"]')return current?.links||[];
      return [];
    }
  };
  const location={
    pathname:'/inspections/60421/questionaries/group/0',
    assign(route){
      stats.navigation.push(route);
      this.pathname=route;
      const id=route.match(/questionaries\/(\d+)$/)?.[1];
      if(id && forms.has(id)){
        current=forms.get(id);
        body.innerText=current.title+'\n63000-13(T504)';
      }else{
        current={
          buttons:[],radios:[],checks:[],
          links:[...forms.values()].map(f=>visible({
            innerText:f.title+' Occurs every Thursday '+
              (saved.has(f.id)?'Saved in Process':'Not Required'),
            textContent:f.title+' Occurs every Thursday '+
              (saved.has(f.id)?'Saved in Process':'Not Required')
          }))
        };
        body.innerText='Questionnaires\n63000-13(T504)';
      }
    }
  };
  const store={
    getItem:key=>session.has(key)?session.get(key):null,
    setItem:(key,value)=>session.set(key,String(value)),
    removeItem:key=>session.delete(key)
  };
  const ctx={
    window:{addEventListener(){},confirm(){stats.confirms++;return true;}},
    document:doc,location,sessionStorage:store,
    setTimeout:fn=>{fn();return 1},setInterval:()=>1,
    crypto:crypto.webcrypto,btoa,console,
    GM_getValue:(_,defaultValue)=>defaultValue,
    GM_setValue:()=>{},
    GM_xmlhttpRequest:()=>{throw Error('No telemetry called in positive test')}
  };
  vm.runInNewContext(injected,ctx);
  const t=ctx.__ropeTest;
  for(const task of t.ROPE_TASKS){
    const form={id:task.id,title:task.name,radios:[],checks:[],buttons:[],links:[]};
    if(task.type==='radio'){
      for(let i=0;i<task.questions.length;i++){
        const group=makeQuestion(i+1,task.questions[i]);
        const nodes=[];
        for(const name of ['Present','Missing']){
          const node=visible({
            value:'on',checked:false,
            labels:[{innerText:name}],parentElement:{innerText:name,parentElement:group},
            getAttribute:key=>key==='aria-label'?name:null,
            click(){nodes.forEach(x=>x.checked=false);this.checked=true}
          });
          nodes.push(node);
          form.radios.push(node);
        }
      }
    }else{
      for(let i=0;i<task.questions.length;i++){
        const question=task.questions[i],group=makeQuestion(i+1,question.name);
        for(const name of question.options){
          form.checks.push(visible({
            checked:false,disabled:false,
            labels:[{innerText:name}],
            parentElement:{innerText:name,parentElement:group},
            getAttribute:key=>key==='aria-label'?name:null,
            click(){this.checked=true}
          }));
        }
      }
    }
    const save=visible({
      textContent:'Save In Process',disabled:false,
      click(){
        stats.formClicks.push({id:task.id,type:'save'});
        saved.add(task.id);
        location.assign('/inspections/60421/questionaries/group/0');
      }
    });
    const submit=visible({
      textContent:'Submit',click(){stats.submitClicks++}
    });
    form.buttons=[save,submit];
    forms.set(task.id,form);
  }
  location.assign('/inspections/60421/questionaries/group/0');
  stats.navigation.length=0;
  return {t,doc,ctx,location,stats,saved,forms,store,body};
}
test('Three Thursday rope questionnaires have their verified T504 IDs and item counts',()=>{
 const h=harness(),t=h.t.ROPE_TASKS;
 assert.deepEqual(Array.from(t,x=>x.id),['91548','91549','91550']);
 assert.deepEqual(Array.from(t,x=>x.name),[
   'Weekly Rope Rescue Equipment (Low Angle Kit 1)',
   'Weekly Rope Rescue Equipment (SAR 2)','Weekly Rope Gear'
 ]);
 assert.equal(t[0].questions.length,11);
 assert.equal(t[1].questions.length,27);
 assert.equal(t[2].questions.reduce((n,q)=>n+q.options.length,0),17);
 assert.equal(t[2].questions.length,4);
});
test('One button activation stages and confirms all 3 rope drafts, never clicks Submit',async()=>{
 const h=harness();
 h.t.beginRopes();
 assert.equal(h.stats.confirms,0,'single button, no additional confirm prompt');
 assert.equal(h.t.readRopes().index,0);
 for(let i=0;i<3;i++){
   const task=h.t.ROPE_TASKS[i];
   assert.equal(h.location.pathname,'/inspections/60421/questionaries/'+task.id);
   await h.t.runRopes(); // validate/fill one form and click Save In Process
   assert.equal(h.stats.formClicks.length,i+1);
   assert.equal(h.saved.has(task.id),true);
   assert.equal(h.location.pathname,'/inspections/60421/questionaries/group/0');
   await h.t.runRopes(); // verify saved card receipt, navigate to next
 }
 assert.equal(h.t.readRopes(),null);
 assert.equal(h.stats.formClicks.length,3);
 assert.equal(h.stats.submitClicks,0);
 assert.deepEqual(h.stats.formClicks.map(x=>x.id),['91548','91549','91550']);
 const result=h.store.getItem(h.t.ROPE_RESULT);
 assert.match(result,/All 3 Thursday rope drafts: Saved in Process confirmed/);
 assert.match(result,/Physically inspect every item/);
 assert.equal(h.forms.get('91548').radios.filter(x=>x.checked).length,11);
 assert.equal(h.forms.get('91549').radios.filter(x=>x.checked).length,27);
 assert.equal(h.forms.get('91550').checks.filter(x=>x.checked).length,17);
});
test('Missing rope radio option rejects the entire form before any save or default',()=>{
 const h=harness(),task=h.t.ROPE_TASKS[0];
 h.location.assign('/inspections/60421/questionaries/'+task.id);
 h.forms.get(task.id).radios.splice(0,1);
 assert.throws(()=>h.t.validateRopeForm(task),/Unexpected rope question\/answer/);
 assert.equal(h.stats.formClicks.length,0);
 assert.equal(h.forms.get(task.id).radios.filter(x=>x.checked).length,0);
});
test('Absent or renamed gear checkbox rejects the form before Save',()=>{
 const h=harness(),task=h.t.ROPE_TASKS[2];
 h.location.assign('/inspections/60421/questionaries/'+task.id);
 h.forms.get(task.id).checks[0].labels=[{innerText:'Wrong Item'}];
 h.forms.get(task.id).checks[0].getAttribute=()=> 'Wrong Item';
 assert.throws(()=>h.t.validateRopeForm(task),/Unexpected rope gear or checkbox/);
 assert.equal(h.stats.formClicks.length,0);
});
test('Wrong unit or questionnaire path rejects all rope form changes',()=>{
 const h=harness(),task=h.t.ROPE_TASKS[0];
 h.location.assign('/inspections/60421/questionaries/91549');
 assert.throws(()=>h.t.validateRopeForm(task),/Wrong T504 Thursday rope questionnaire/);
 h.location.assign('/inspections/60421/questionaries/'+task.id);
 h.location.pathname='/inspections/99999/questionaries/'+task.id;
 assert.throws(()=>h.t.validateRopeForm(task),/Wrong T504 Thursday rope questionnaire/);
 assert.equal(h.stats.formClicks.length,0);
});
test('Rope receipt cannot be inferred from Save click alone and no form can be auto-submitted',()=>{
 const h=harness(),task=h.t.ROPE_TASKS[0];
 h.location.assign('/inspections/60421/questionaries/group/0');
 assert.equal(h.t.ropeSavedOnGroup(task),false);
 h.t.beginRopes();
 assert.equal(h.t.readRopes().stage,'form');
 assert.equal(h.t.ropeSavedOnGroup(task),false);
 assert.equal(h.stats.submitClicks,0);
 assert.match(src,/form\.save\.click\(\)/);
 assert.doesNotMatch(src,/form\.submit\.click\(\)/);
 assert.match(src,/No automatic resubmission/);
});
