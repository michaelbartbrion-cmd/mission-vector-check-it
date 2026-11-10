'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    function scbaAirpackFillNativeFailureDetails() {');
const b=src.indexOf('    async function scbaAirpackShowNativeHandoff() {',a);
assert.ok(a>=0 && b>a,'native failure handler exists');
const code=src.slice(a,b)+'\nreturn scbaAirpackFillNativeFailureDetails;';
const clean=t=>String(t||'').trim().replace(/\s+/g,' ');
const equal=(a,b)=>clean(a).toLowerCase()===clean(b).toLowerCase();
const includes=(a,b)=>clean(a).toLowerCase().includes(clean(b).toLowerCase());
function harness({show=true,itemName='AP-45',rowName='AP-45',
    selected=true,existing='',comment='Regulator leaking at connection.',
    phase='form_prefilled',template='113271',instance='9560253'}={}){
    let clicks=0,writes=0,mutations=0,status='';
    const input={
        value:existing,getAttribute:name=>name==='placeholder'?'Add a note for the failure ':''
    };
    const leaf={children:[],innerText:rowName,textContent:rowName};
    const row={
        querySelectorAll:()=>[leaf],
        classList:{contains:x=>x==='selected'?selected:false},
        click(){clicks++;selected=true}
    };
    const modal={
        innerText:'FAILURE DETAILS\nSELECT FAILING ITEMS\nFailure Notes(*)',
        querySelectorAll:selector=>selector==='textarea,input[placeholder]'?[input]:
            selector==='.equipment-items__item-list'?[row]:[]
    };
    const doc={querySelectorAll:()=>show?[modal]:[]};
    const queue={inspectionVersion:'3.2.62',phase,index:0,
        createdAt:Date.now(),openedAt:Date.now()-600,
        items:[{name:itemName,result:'issue',comment}]};
    const storage={setItem(_k,v){mutations++;Object.assign(queue,JSON.parse(v));}};
    const factory=new Function('scbaAirpackReadNativeQueue','getRun',
        'currentInspection','SCBA_FRAME_INSPECTION_TEMPLATE','document',
        'visible','uiIncludes','uiEquals','clean','sessionStorage',
        'SCBA_AIRPACK_NATIVE_HANDOFF_KEY','nativeSetInput','setStatus',code);
    const fn=factory(()=>queue,()=>null,()=>({template,instance}),
        '113271',doc,()=>true,includes,equal,clean,storage,'native-key',
        (field,value)=>{writes++;field.value=value;},message=>{status=message});
    return {fn,input,queue,stats:()=>({clicks,writes,mutations,status,selected})};
}
test('native SCBA FAILURE DETAILS auto-fills required note and keeps selected airpack',()=>{
    const x=harness();
    assert.equal(x.fn(),true);
    assert.equal(x.input.value,'Regulator leaking at connection.');
    assert.equal(x.stats().clicks,0,'already selected native row must remain selected');
    assert.equal(x.stats().writes,1);
    assert.equal(x.queue.failureNotePreparedFor,'9560253');
    assert.match(x.stats().status,/Nothing was submitted by Rebel/);
    assert.equal(x.fn(),true);
    assert.equal(x.stats().writes,1,'do not overwrite repeated modal or navigation');
});
test('native failure modal selects the exact failed SCBA item when initially unselected',()=>{
    const x=harness({selected:false});
    assert.equal(x.fn(),true);
    assert.equal(x.stats().clicks,1);
    assert.equal(x.stats().selected,true);
});
test('does not guess or overwrite another item or a newer inspector-typed note',()=>{
    const wrong=harness({rowName:'AP-99'});
    assert.equal(wrong.fn(),false);
    assert.equal(wrong.stats().writes,0);
    const human=harness({existing:'Different observation added by inspector'});
    assert.equal(human.fn(),false);
    assert.equal(human.input.value,'Different observation added by inspector');
    assert.equal(human.stats().writes,0);
});
test('only the real SCBA inspection failure modal can receive a note',()=>{
    for(const opts of [{show:false},{template:'119122'},{phase:'open_item'},
        {comment:''}]) {
        const x=harness(opts);
        assert.equal(x.fn(),false);
        assert.equal(x.stats().writes,0);
    }
});
test('the helper never submits or guesses a new native inspection',()=>{
    assert.match(code,/FAILURE DETAILS/);
    assert.match(code,/SELECT FAILING ITEMS/);
    assert.match(code,/Add a note for the failure/);
    assert.match(code,/equipment-items__item-list/);
    assert.doesNotMatch(code,/\.submit\(|submitInspection\(|Submit Inspection.*click\(|mainSubmit\.click\(/);
});
