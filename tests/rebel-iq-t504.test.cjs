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
  assert.match(chunk,/groups\.length !== task\.count/);
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


test('Daily Tour accepts 41 radio questions and optional General Comments #42 without overwriting it',async()=>{
  const start=src.indexOf('  function validateForm(kind) {');
  const end=src.indexOf('  function applyTextarea(',start);
  assert.ok(start>=0&&end>start,'validator boundaries');
  const functionText=src.slice(start,end)+'\nreturn validateForm;';
  const clean=x=>String(x??'').replace(/\s+/g,' ').trim();
  const radioGroups=[];
  for(let i=1;i<=41;i++){
    const name=i===1?'Fuel':i===41?'Hand Tools':'Inspection Item '+i;
    const value=i===1?'Full':i===41?'Present':'Pass';
    const options=[value,'Fail'].map(v=>({value:v,checked:false,click(){this.checked=true}}));
    const group={innerText:i+'.\n'+name+'\n*\n'+options.map(x=>x.value).join('\n'),
      querySelector:selector=>selector==='mat-radio-group'?{}:null,
      querySelectorAll:selector=>selector==='mat-radio-group input[type="radio"]'?options:[]};
    radioGroups.push(group);
  }
  const comment={innerText:'42.\nGeneral Comments\nType something',
    querySelector:()=>null,querySelectorAll:()=>[]};
  const commentInput={value:'Existing inspector note',closest:selector=>selector==='.form-group'?comment:null};
  const save={textContent:'Save In Process',disabled:false,clicked:0,click(){this.clicked++}};
  const doc={
    body:{innerText:'63000-13 Tour Check\n63000-13(T504)'},
    querySelectorAll(selector){
      if(selector==='.form-group')return [...radioGroups,comment];
      if(selector==='.form-group textarea.text-qs-input')return [commentInput];
      if(selector==='button')return [save];
      return [];
    }
  };
  const num=container=>Number(clean(container?.innerText).match(/^(\d+)\s*\./)?.[1]||0);
  const name=container=>clean((container?.innerText||'').split(/\r?\n/).map(clean).filter(Boolean).slice(1,3).filter(x=>x!=='*').join(' '));
  const validate=new Function('TASKS','formId','t504Visible','clean','document',
    'questionNumber','questionName','visible',functionText)(
    {daily:{name:'63000-13 Tour Check',count:41},weekly:{name:'Weekly 63000-13 Check',count:12}},
    ()=>'91546',()=>true,clean,doc,num,name,()=>true);
  const parsed=validate('daily');
  assert.equal(parsed.radioMap.size,41);
  assert.equal(parsed.textMap.size,1);
  assert.equal(parsed.textMap.get(42).textarea.value,'Existing inspector note');
  assert.equal(parsed.save,save);
  assert.equal(save.clicked,0);
  comment.innerText='42.\nRenamed Comments\nType something';
  assert.throws(()=>validate('daily'),/Daily questionnaire changed/);
  assert.equal(save.clicked,0);
});

test('Rebel IQ exposes a direct Check for Update button and preserves Tampermonkey URLs',()=>{
 assert.match(src,/Check for Update/);
 assert.match(src,/update\.href = 'https:\/\/raw\.githubusercontent\.com\/michaelbartbrion-cmd\/mission-vector-check-it\/main\/beta\/rebel-iq\.user\.js'/);
 assert.match(src,/@updateURL\s+https:\/\/raw\.githubusercontent\.com/);
 assert.match(src,/v0\.1\.3/);
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
