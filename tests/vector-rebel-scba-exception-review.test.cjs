'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=src.indexOf('    function scbaAirpackBeginExceptionReview(item,kind) {');
const end=src.indexOf('    function scbaAirpackNativeQueue(scan) {',start);
assert.ok(start>=0&&end>start);
const names=src.match(/const SCBA_FRAME_INSPECTION_QUESTIONS = Object.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(names);
const questions=(new Function('return ['+names[1]+']'))();
const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
const f=new Function('SCBA_FRAME_INSPECTION_QUESTIONS','clean',
    src.slice(start,end)+'\nreturn {begin:scbaAirpackBeginExceptionReview,'+
    'problem:scbaAirpackReviewProblem,ready:scbaAirpackReadyNativeAnswers};')(
        questions,clean);
const q=()=>({name:'AP-45',draftResult:'present_working',result:'present_working'});
test('normal SCBA result passes the whole eleven-question form without expanding anything',()=>{
    const item=q();
    f.begin(item,'present_working');
    assert.equal(f.problem(item),'');
    assert.equal(item.comment,'');
    assert.equal(item.questionAnswers,null);
    assert.deepEqual(f.ready(item),Array(11).fill('pass'));
});
test('Fail / Issue expands eleven proposed Pass selections, requires a Fail and a comment',()=>{
    const item=q();
    f.begin(item,'issue');
    item.result='issue';
    assert.equal(item.questionAnswers.length,11);
    assert.deepEqual(item.questionAnswers,Array(11).fill('pass'));
    assert.match(f.problem(item),/comment|explain/i);
    item.comment='Regulator seal is leaking during operation.';
    assert.match(f.problem(item),/mark at least one failed/i);
    item.questionAnswers[6]='fail';
    assert.equal(f.problem(item),'');
    assert.equal(f.ready(item)[6],'fail');
    assert.equal(f.ready(item).filter(x=>x==='pass').length,10);
});
test('Missing auto-fails every SCBA question and requires only a comment',()=>{
    const item=q();
    f.begin(item,'missing');
    item.result='missing';
    assert.deepEqual(item.questionAnswers,Array(11).fill('fail'));
    assert.match(f.problem(item),/explain/i);
    item.comment='AP-45 not present in Medic 504 inventory.';
    assert.equal(f.problem(item),'');
    assert.deepEqual(f.ready(item),Array(11).fill('fail'));
    item.questionAnswers[7]='pass';
    assert.match(f.problem(item),/all 11 checks marked Failed/);
    assert.equal(f.ready(item),null);
});
test('exception note cannot be blank; switching back to Pass removes stale failure answers',()=>{
    const item=q();
    f.begin(item,'issue');item.result='issue';
    item.questionAnswers[7]='fail';
    item.comment='Gauge off by 15 percent.';
    assert.equal(f.problem(item),'');
    item.comment='  ';
    assert.match(f.problem(item),/explain/i);
    f.begin(item,'present_working');item.result='present_working';
    assert.equal(item.comment,'');
    assert.equal(item.questionAnswers,null);
    assert.equal(f.problem(item),'');
});
test('Pass stays compact, Missing shows comment only, Issue opens the 11-question accordion',()=>{
    const x=src.slice(src.indexOf('    function showStation4ScbaAirpackCheck() {'),
        src.indexOf('    function installPanel() {'));
    assert.match(x,/exceptionPanel\.style\.display=issue\|\|missing\?'block':'none'/);
    assert.match(x,/accordion\.style\.display=issue\?'block':'none'/);
    assert.match(x,/accordion\.open=issue/);
    assert.match(x,/missingMessage\.textContent='Missing: all 11 SCBA checks will be marked Failed/);
    assert.match(x,/exceptionPanel\.append\(accordion,commentLabel\)/);
    assert.match(x,/SCBA_FRAME_INSPECTION_QUESTIONS\.length/);
    assert.match(x,/document\.createElement\('textarea'\)/);
    assert.match(x,/comment\.maxLength=1000/);
    assert.match(x,/physical\.checked=false/);
});
test('native failure detail notes use the exact Vector field, not an invented comment UI',()=>{
    const x=src.slice(src.indexOf('    function scbaAirpackFillNativeFailureDetails() {'),
        src.indexOf('    async function scbaAirpackShowNativeHandoff() {'));
    assert.match(x,/FAILURE DETAILS/);
    assert.match(x,/Add a note for the failure/);
    assert.match(x,/SELECT FAILING ITEMS/);
    assert.match(x,/nativeSetInput\(input,note\)/);
    assert.match(x,/equipment-items__item-list/);
    assert.doesNotMatch(x,/submit\.click\(|Submit Inspection'\)\.click\(/);
});
