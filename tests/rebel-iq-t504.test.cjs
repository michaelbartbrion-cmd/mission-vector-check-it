'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');

test('Rebel IQ is limited to the authorized Operative IQ site and T504',()=>{
  assert.match(src, /@match\s+https:\/\/fmfd\.operativeiqfrontline\.com\/\*/);
  assert.match(src, /63000-13\s*Tour Check/);
  assert.match(src, /Weekly 63000-13 Check/);
  assert.match(src, /t504Visible\(\)/);
  assert.match(src, /inspectionId\(\) !== pending\.unitId/);
});
test('Both actions save in process without submission',()=>{
  assert.match(src, /button\('Daily Tour: Save In Process'/);
  assert.match(src, /button\('Weekly: Save In Process'/);
  assert.match(src, /clean\(button\.textContent\) === 'Save In Process'/);
  assert.match(src, /verified\.save\.click\(\)/);
  assert.doesNotMatch(src, /\.click\(\).*Submit/);
  const form = src.slice(src.indexOf('async function prepare(kind)'),src.indexOf('async function runPending()'));
  assert.doesNotMatch(form, /fetch\(|XMLHttpRequest|Submit Inspection/);
  assert.doesNotMatch(src, /\.click\(\).*Submit/);
});
test('Form layout is checked before any answer is changed',()=>{
  const chunk=src.slice(src.indexOf('function validateForm(kind)'),src.indexOf('function applyTextarea('));
  assert.match(chunk,/radioMap\.size !== task\.count/);
  assert.match(chunk,/textMap\.size !== 11/);
  assert.match(chunk,/radioMap\.size !== 41/);
  assert.match(chunk,/Unrecognized weekly option/);
  const prepare=src.slice(src.indexOf('async function prepare(kind)'),src.indexOf('async function runPending()'));
  assert.ok(prepare.indexOf('validateForm(kind)')<prepare.indexOf('chosen.click()'));
});
test('Weekly defaults preserve unread hours and stage tire values for verification',()=>{
  assert.match(src,/i <= 3 \? '' : '110'/);
  assert.match(src,/i === 7 \? 'Not needed'/);
  assert.match(src,/for \(let i = 16; i <= 23; i\+\+\)/);
  assert.match(src,/You must verify every item at the truck/);
});

test('Rebel IQ shares exact 54px Starbird launcher used by the Rebel fleet',()=>{
  const vector=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
  const match=vector.match(/function rebelStarbirdSvg\(\) \{[\s\S]*?return `([\s\S]*?)`;/);
  const icon=match?.[1]?.trim();
  assert.ok(icon&&icon.includes('data:image/png;base64,'),'Vector Rebel icon source found');
  assert.ok(src.includes('const rebelStarbirdIcon = `'+icon+'`;'), 'Must use the exact source artwork');
  assert.match(src,/toggle\.innerHTML = rebelStarbirdIcon/);
  assert.match(src,/width:54px;height:54px/);
  assert.doesNotMatch(src,/toggle\.textContent = 'RIQ'/);
  assert.match(src,/header\.append\(toggle\)/);
  assert.match(src,/root\.append\(toggle\)/);
  assert.match(src,/Minimize Rebel IQ/);
});



function formHarness(kind='daily') {
  const clean = value=>String(value??'').replace(/\s+/g,' ').trim();
  const body = {innerText:'63000-13(T504)',parentElement:null};
  const inputs=[], textareas=[], groups=new Map();
  const makeGroup=(number,name)=>{
    const group={
      innerText:number+'. '+name+' *\n',parentElement:body,
      closest:()=>null
    };
    groups.set(number,group);return group;
  };
  const radio=(number,name,labels)=>{
    const group=makeGroup(number,name);
    for(const label of labels){
      const wrapper={innerText:label,parentElement:group,closest:()=>null};
      const node={
        value:'on',checked:false,parentElement:wrapper,closest:()=>null,
        getAttribute:k=>k==='aria-label'?label:null,
        click(){this.checked=true;}
      };
      inputs.push(node);
    }
  };
  const text=(number,name,value='')=>{
    const group=makeGroup(number,name);
    const textarea={
      value,parentElement:group,closest:()=>null
    };
    textareas.push(textarea);
    return textarea;
  };
  let comment;
  if(kind==='daily'){
    for(let n=1;n<=41;n++){
      const name=n===1?'Fuel':n===41?'Hand Tools':'Inspection Item '+n;
      const label=n===1?'Full':n===41?'Present':'Pass';
      radio(n,name,[label,n===1?'3/4':'Fail']);
    }
    comment=text(42,'General Comments','Keep this inspector note');
  }else{
    text(1,'Odometer');
    text(2,'Aerial Hours');
    text(3,'Engine Hours');
    for(let n=4;n<=15;n++){
      const name=n===7?'Aerial Lubrication':'Inspection Item '+n;
      radio(n,name,n===7?['Needed','Not needed']:[n<=6?'Full':'Pass','Fail']);
    }
    for(let n=16;n<=23;n++)text(n,'Tire Pressure '+n);
  }
  const save={
    textContent:'Save In Process',disabled:false,clicked:0,
    click(){this.clicked++;}
  };
  const doc={
    body,
    querySelectorAll(selector){
      if(selector==='input[type="radio"]')return inputs;
      if(selector==='[role="radio"]')return [];
      if(selector==='textarea')return textareas;
      if(selector==='button')return [save];
      if(selector==='.form-group')return []; // Current Operative IQ is not Angular Material.
      return [];
    }
  };
  const from=src.indexOf('  const questionNumber = container =>');
  const to=src.indexOf('  function applyTextarea(',from);
  assert.ok(from>0&&to>from,'reader extraction');
  const code=src.slice(from,to)+'\nreturn {validateForm,readIqForm};';
  const result=new Function('document','PANEL','TASKS','formId','t504Visible','clean','visible',code)(
    doc,'rebel-iq-t504-panel',
    {daily:{name:'63000-13 Tour Check',count:41},weekly:{name:'Weekly 63000-13 Check',count:12}},
    ()=>kind==='daily'?'91546':'91545',()=>true,clean,()=>true);
  doc.body.innerText=(kind==='daily'?'63000-13 Tour Check':'Weekly 63000-13 Check')+'\n63000-13(T504)';
  return {validate:()=>result.validateForm(kind),inputs,textareas,groups,save,comment,doc};
}
test('Daily Tour recognizes 41 native radio questions plus General Comments, without mat-radio-group',()=>{
  const h=formHarness('daily');
  const parsed=h.validate();
  assert.equal(parsed.radioMap.size,41);
  assert.equal(parsed.textMap.size,1);
  assert.equal(parsed.textMap.get(42).textarea.value,'Keep this inspector note');
  assert.equal(parsed.radioMap.get(1).choices[0].value,'Full');
  assert.equal(parsed.radioMap.get(41).choices[0].value,'Present');
  assert.equal(h.save.clicked,0);
  h.groups.get(42).innerText='42. Renamed Comments *\n';
  assert.throws(h.validate,/Daily questionnaire changed/);
  assert.equal(h.save.clicked,0);
});
test('Weekly Check recognizes 12 native-radio and 11 textarea questions without mat-radio-group',()=>{
  const h=formHarness('weekly');
  const parsed=h.validate();
  assert.equal(parsed.radioMap.size,12);
  assert.equal(parsed.textMap.size,11);
  assert.equal(parsed.radioMap.get(7).choices[1].value,'Not needed');
  assert.equal(parsed.textMap.get(1).textarea.value,'');
  assert.equal(h.save.clicked,0);
  h.groups.get(7).innerText='7. Changed Aerial Activity *\n';
  assert.throws(h.validate,/Weekly questionnaire changed/);
  assert.equal(h.save.clicked,0);
});
test('Missing, extra or duplicated real radio card blocks before any draft save',()=>{
  const h=formHarness('daily');
  h.inputs.splice(0,2);
  assert.throws(h.validate,/Unexpected questionnaire layout/);
  assert.equal(h.save.clicked,0);
});

test('Rebel IQ exposes a direct Check for Update button and preserves Tampermonkey URLs',()=>{
 assert.match(src,/Check for Update/);
 assert.match(src,/update\.href = 'https:\/\/raw\.githubusercontent\.com\/michaelbartbrion-cmd\/mission-vector-check-it\/main\/beta\/rebel-iq\.user\.js'/);
 assert.match(src,/@updateURL\s+https:\/\/raw\.githubusercontent\.com/);
 assert.match(src,/v0\.1\.4/);
});
test('Rebel IQ automatically collects failures and keeps them queued until confirmed delivery',()=>{
 assert.match(src,/@grant\s+GM_getValue/);
 assert.match(src,/@grant\s+GM_setValue/);
 assert.match(src,/@grant\s+GM_xmlhttpRequest/);
 assert.match(src,/@connect\s+base44\.app/);
 assert.match(src,/captureIqError\(error, pending\.kind \+ ':prepare'\)/);
 assert.match(src,/captureIqError\('Questionnaire navigation did not settle'/);
 assert.match(src,/if \(!await submitIqReport\(device, report\)\)/);
 assert.match(src,/acceptedSuggestions/);
 assert.match(src,/duplicateSuggestions/);
 assert.match(src,/GM_setValue\(IQ_ERRORS_KEY,\s*readIqErrors\(\)\.filter/);
 assert.match(src,/setInterval\(\(\) => \{ void flushIqErrors\(\); \}, 5 \* 60 \* 1000\)/);
 assert.match(src,/Rebel Command:/);
 assert.doesNotMatch(src,/document\.body\.outerHTML|localStorage\.(?:get|set)Item|sessionStorage\.getItem\(.*token/i);
});
