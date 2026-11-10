'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    async function scbaAirpackPrefillVerifiedForm() {');
const b=src.indexOf('    async function scbaAirpackShowNativeHandoff() {',a);
assert.ok(a>=0&&b>a);
const helperStart=src.indexOf('    function scbaAirpackReadyNativeAnswers(item) {');
const helperEnd=src.indexOf('    function scbaAirpackNativeQueue(scan) {',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart);
const code=src.slice(helperStart,helperEnd)+src.slice(a,b)+
    '\nreturn scbaAirpackPrefillVerifiedForm;' ;
const qs=src.match(/const SCBA_FRAME_INSPECTION_QUESTIONS = Object.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(qs,'actual Standard SCBA question list is declared');
const questions=(new Function('return ['+qs[1]+']'))();
assert.equal(questions.length,11);
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
function harness({result='present_working',template='113271',count=11,
    questionList=questions,physical=true,phase='native_form_opened',activePpe=false,
    questionAnswers=null,comment=''}={}){
    let times=0,phaseWritten='',status='',submits=0,remaining=count;
    const selections=[];
    const queue={inspectionVersion:'3.2.62',phase,
        openedAt:Date.now()-500,items:[{name:'AP-04',result,questionAnswers,comment}],index:0};
    const answers=Array.from({length:count},()=>({click(){
        times++;remaining--;selections.push('pass');
    }}));
    const failed=Array.from({length:count},()=>({click(){
        times++;remaining--;selections.push('fail');
    }}));
    const doc={body:{innerText:'SCBA Inspection\n'+questionList.join('\n')},
        querySelectorAll:()=>[]};
    const store={setItem(_k,s){phaseWritten=JSON.parse(s).phase;
        Object.assign(queue,JSON.parse(s));}};
    const fn=new Function('scbaAirpackFormBusy','scbaAirpackReadNativeQueue','getRun',
        'currentInspection','SCBA_FRAME_INSPECTION_TEMPLATE','SCBA_FRAME_INSPECTION_TITLE',
        'isLiveInspectionPage','exactButtons','scbaAirpackNativeResponseButtons',
        'isCompletedInspectionView','uiIncludes','exactButton','document','uiText',
        'SCBA_FRAME_INSPECTION_QUESTIONS','clean','visible','enabledButton','sessionStorage',
        'SCBA_AIRPACK_NATIVE_HANDOFF_KEY','setStatus','sleep',code);
    const run=fn(false,()=>queue,()=>activePpe?{}:null,
        ()=>({template,instance:'9560020'}),'113271','SCBA Inspection',
        ()=>true,()=>[],label=>label==='Passed'?answers.slice(0,remaining):
            label==='Failed'?failed.slice(0,remaining):[],
        ()=>false,(text,label)=>String(text).includes(label),()=>({}),
        doc,clean,questions,clean,()=>true,()=>null,store,'key',
        text=>{status=text},async()=>{});
    return {run,queue,stats:()=>({times,phaseWritten,status,submits,selections})};
}
test('Official Standard SCBA form is explicitly mapped, never the seven-question SCBA PPE mask',()=>{
    assert.match(src,/const SCBA_FRAME_POOL = '299946'/);
    assert.match(src,/const SCBA_FRAME_INSPECTION_TEMPLATE = '113271'/);
    assert.match(src,/const SCBA_FRAME_INSPECTION_TITLE = 'SCBA Inspection'/);
    assert.equal(questions.length,11);
    assert.match(src,/const SCBA_TOUR_TEMPLATE = '119122'/);
});
test('One-time prefill enters all 11 Passed answers on exact verified Standard form but never submits',async()=>{
    const h=harness();
    assert.equal(await h.run(),true);
    assert.equal(h.stats().times,11);
    assert.equal(h.stats().phaseWritten,'form_prefilled');
    assert.match(h.stats().status,/Review the form/);
    assert.doesNotMatch(code,/enabledButton\('Submit Inspection'\)\.click|submit\.click\(\)|mainSubmit\.click/);
    assert.equal(await h.run(),false);
    assert.equal(h.stats().times,11,'new calls must not re-toggle responses');
});
test('Wrong form template fails closed without clicking any Passed or Submit',async()=>{
    const h=harness({template:'119122'});
    assert.equal(await h.run(),false);
    assert.equal(h.stats().times,0);
    assert.equal(h.stats().phaseWritten,'wrong_template');
});
test('Changed form count or question order blocks the automatic PASS sequence',async()=>{
    for(const opts of [{count:10},{count:12},{questionList:[...questions].reverse()}]){
        const h=harness(opts);
        assert.equal(await h.run(),false);
        assert.equal(h.stats().times,0);
        assert.equal(h.stats().phaseWritten,'form_review_required');
    }
});
test('Exception, stale handoff, or active PPE run cannot get auto-filled as PASS',async()=>{
    for(const opts of [{result:'missing'},{result:'issue'},{phase:'form_prefilled'},
        {activePpe:true}]){
        const h=harness(opts);
        assert.equal(await h.run(),false);
        assert.equal(h.stats().times,0);
    }
    const h=harness();
    h.queue.openedAt=Date.now()-50000;
    assert.equal(await h.run(),false);
    assert.equal(h.stats().times,0);
});

test('SCBA response control lookup tolerates native checkmark icons without matching unrelated buttons',()=>{
    const start=src.indexOf('    function scbaAirpackNativeResponseButtons(label) {');
    const end=src.indexOf('    async function scbaAirpackPrefillVerifiedForm() {',start);
    assert.ok(start>=0&&end>start);
    const source=src.slice(start,end)+'\nreturn scbaAirpackNativeResponseButtons;';
    const values=['✓ Passed','✓ Passed','✕ Failed','Not Passed','Submit Inspection'];
    const buttons=values.map(v=>({innerText:v,closest:()=>null}));
    const f=new Function('document','visible','PANEL_ID','OVERLAY_ID',
        'SCBA_AIRPACK_NATIVE_BANNER_ID','uiEquals','uiText',source)(
        {querySelectorAll:()=>buttons},()=>true,'panel','overlay','native-banner',
        (a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),clean);
    assert.equal(f('Passed').length,2);
    assert.equal(f('Failed').length,1);
});

test('Issue fills a specific mix of Pass and Fail and preserves the equipment comment',async()=>{
    const answerPlan=questions.map((_,i)=>i===3||i===6?'fail':'pass');
    const h=harness({result:'issue',questionAnswers:answerPlan,
        comment:'Cylinder bracket damaged and regulator bypass not functioning.'});
    assert.equal(await h.run(),true);
    assert.deepEqual(h.stats().selections,answerPlan);
    assert.equal(h.stats().times,11);
    assert.match(h.stats().status,/Rebel will populate its note/);
});
test('Missing item with unperformed questions is never automatically marked Passed',async()=>{
    const partial=['fail',...Array(10).fill('')];
    const h=harness({result:'missing',questionAnswers:partial,
        comment:'AP-45 missing from Medic 504 mounting position.'});
    assert.equal(await h.run(),false);
    assert.equal(h.stats().times,0);
    const reviewed=['fail',...Array(10).fill('fail')];
    const checked=harness({result:'missing',questionAnswers:reviewed,
        comment:'Missing airpack, failed equipment inventory and associated questions.'});
    assert.equal(await checked.run(),true);
    assert.deepEqual(checked.stats().selections,reviewed);
});
test('Issue with no stated failed question, no comment, or incomplete answers cannot be prefilled',async()=>{
    const noFail=harness({result:'issue',questionAnswers:Array(11).fill('pass'),
        comment:'Problem unknown'});
    assert.equal(await noFail.run(),false);
    const noComment=harness({result:'issue',questionAnswers:['fail',...Array(10).fill('pass')],
        comment:''});
    assert.equal(await noComment.run(),false);
    const incomplete=harness({result:'issue',
        questionAnswers:['fail',...Array(9).fill('pass'),''],
        comment:'Fault found'});
    assert.equal(await incomplete.run(),false);
});

test('Missing all 11 passes to native form as eleven Fails after a required comment',async()=>{
    const h=harness({result:'missing',questionAnswers:Array(11).fill('fail'),
        comment:'Airpack AP-45 missing from Medic 504.'});
    assert.equal(await h.run(),true);
    assert.deepEqual(h.stats().selections,Array(11).fill('fail'));
    assert.equal(h.stats().phaseWritten,'form_prefilled');
});
