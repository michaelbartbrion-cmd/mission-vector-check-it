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
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|Submit Inspection/);
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
