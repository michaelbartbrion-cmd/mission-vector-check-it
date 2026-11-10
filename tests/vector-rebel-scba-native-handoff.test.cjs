'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=src.indexOf('    function scbaAirpackBeginExceptionReview(item,kind) {');
const end=src.indexOf('    function showStation4ScbaAirpackCheck() {',start);
assert.ok(start>=0&&end>start);
const code=src.slice(start,end)+'\nreturn {queue:scbaAirpackNativeQueue,'+
    'begin:scbaAirpackBeginNativeChecks,read:scbaAirpackReadNativeQueue,'+
    'advance:scbaAirpackAdvanceNativeQueue,'+
    'handoff:scbaAirpackShowNativeHandoff};';
const defs=[
    {id:'truck504',label:'Truck 504'},
    {id:'medic504',label:'Medic 504'},
    {id:'station4',label:'Station 4 SCBA Room'}
];
const key='scba-native-handoff-test', draft='scba-draft-test';
const item=(name,scope,result='present_working',i=12)=>({
    name,scope,result,location:'Truck 504: 63000-13',pool:'SCBA Frame',
    href:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/'+i+'/item',
    draftResult:result,
    comment:result==='present_working'?'':'Physical exception recorded in test',
    questionAnswers:result==='issue'?['fail',...Array(10).fill('pass')]:
        result==='missing'?Array(11).fill('fail'):null
});
function harness({items=[item('AP-04','truck504')],header='AP-04',
    url='https://app.vectorcheckit.us/main/asset-manager',activePpe=false}={}){
    let navigated='',nativeStarts=0,saved=null,summary=null,attached=null;
    const state=new Map();
    const sessionStorage={
        setItem(k,v){state.set(k,v)},getItem:k=>state.get(k)||null,
        removeItem:k=>state.delete(k)
    };
    const location={
        href:url,origin:'https://app.vectorcheckit.us',
        assign(href){navigated=href}
    };
    const starting={
        innerText:'Start Inspection',textContent:'Start Inspection',
        disabled:false,closest:()=>null,getAttribute:()=>null,
        click(){nativeStarts++}
    };
    const document={
        body:{append(el){attached=el}},
        createElement(tag){return {
            tag,style:{},setAttribute(){},append(){},remove(){},
            textContent:'',type:''
        }},
        querySelectorAll(query){
            if(query.startsWith('h1,h2,h3,h4'))return [
                {innerText:header,textContent:header,closest:()=>null}
            ];
            if(query==='button,[role="button"]')return [starting];
            return [];
        },
        getElementById:()=>null
    };
    const fn=new Function('SCBA_AIRPACK_LOCATIONS','location','getRun',
        'GM_setValue','sessionStorage','SCBA_AIRPACK_NATIVE_HANDOFF_KEY',
        'SCBA_AIRPACK_DRAFT_KEY','document','SCBA_AIRPACK_NATIVE_BANNER_ID',
        'visible','uiEquals','clean','sleep','setStatus','PANEL_ID',
        'OVERLAY_ID','SCBA_FRAME_POOL','SCBA_FRAME_INSPECTION_QUESTIONS',code);
    const x=fn(defs,location,()=>activePpe?{}:null,
        (k,v)=>{if(k===draft)saved=v;else if(k===draft+'-handoff')summary=v;else assert.fail('wrong draft key');},
        sessionStorage,key,draft,document,'native-banner-test',
        ()=>true,(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),
        v=>String(v||'').replace(/\s+/g,' ').trim(),
        async()=>{},()=>{},'rebel-panel','rebel-overlay','299946',
        Array.from({length:11},(_,i)=>'Question '+(i+1)));
    return {...x,location,sessionStorage,scan:{complete:true,items},
        get:()=>({navigated,nativeStarts,saved,summary,attached,stored:state.get(key)})};
}
test('all SCBA physical-review dropdowns default to proposed Present / Working',()=>{
    const ui=src.slice(src.indexOf('    function showStation4ScbaAirpackCheck() {'),
        src.indexOf('    function installPanel() {'));
    assert.match(ui,/select\.value='present_working'/);
    assert.match(ui,/item\.draftResult='present_working'/);
    assert.match(ui,/\['issue','Fail \/ Issue'\]/);
    assert.match(ui,/\['missing','Missing'\]/);
    assert.match(ui,/document\.createElement\('details'\)/);
    assert.match(ui,/document\.createElement\('textarea'\)/);
    assert.match(ui,/SCBA_FRAME_INSPECTION_QUESTIONS\.length/);
    assert.match(ui,/physical\.checked=false/);
    assert.match(ui,/scbaAirpackBeginNativeChecks\(scan,physical\.checked\)/);
});
test('native handoff requires human confirmation even though proposed defaults are green',()=>{
    const h=harness();
    assert.throws(()=>h.begin(h.scan,false),/physically checked/);
    assert.equal(h.get().stored,undefined);
    assert.equal(h.get().navigated,'');
    assert.equal(h.get().saved,null);
});
test('native check queues exact asset URLs and never marks a draft as official completion',()=>{
    const h=harness({items:[
        item('AP-04','truck504','present_working',12),
        item('AP-45','medic504','missing',13)
    ]});
    const run=h.begin(h.scan,true);
    assert.equal(run.index,0);
    assert.equal(run.items.length,2);
    assert.equal(run.items[1].result,'missing');
    assert.equal(run.phase,'open_item');
    assert.equal(h.get().navigated,'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/12/item');
    assert.equal(h.get().saved.draftOnly,true);
    assert.equal(h.get().saved.nativeCheckStarted,true);
    assert.equal(h.read().items.length,2);
    assert.doesNotMatch(code,/submitInspection\(|mainSubmit\.click\(|enabledButton\('Submit Inspection'\)\.click\(/);
});
test('missing native URLs, duplicate identity, or unreviewed assets cannot start',()=>{
    const h=harness();
    assert.throws(()=>h.queue({complete:false,items:[]}),/complete/);
    assert.throws(()=>h.queue({complete:true,items:[item('A','truck504','not_checked')]}),
        /Review each/);
    assert.throws(()=>h.queue({complete:true,items:[{...item('A','truck504'),href:'https://bad.example/main/a'}]}),
        /safe native/);
    assert.throws(()=>h.queue({complete:true,items:[
        item('A','truck504','present_working',7),
        item('B','medic504','present_working',7)
    ]}),/Duplicate/);
});
test('opens official native Start Inspection once only when exact item URL and heading verified',async()=>{
    const h=harness({url:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/12/item'});
    h.sessionStorage.setItem(key,JSON.stringify(h.queue(h.scan)));
    assert.equal(await h.handoff(),true);
    assert.equal(h.get().nativeStarts,1);
    assert.equal(h.read().phase,'native_form_opened');
    await h.handoff();
    assert.equal(h.get().nativeStarts,1,'reload must not start a duplicate inspection');
    assert.equal(h.get().attached.tag,'div');
});
test('wrong native asset heading refuses Start Inspection',async()=>{
    const h=harness({url:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/12/item',header:'AP-99'});
    h.sessionStorage.setItem(key,JSON.stringify(h.queue(h.scan)));
    assert.equal(await h.handoff(),true);
    assert.equal(h.get().nativeStarts,0);
    assert.equal(h.read().phase,'open_item');
});
test('active PPE run blocks a second SCBA workflow',()=>{
    const h=harness({activePpe:true});
    assert.throws(()=>h.begin(h.scan,true),/active PPE/);
    assert.equal(h.get().stored,undefined);
});

test('SCBA native handoff visits each airpack separately and never conflates submissions',()=>{
    const h=harness({items:[
        item('AP-04','truck504','present_working',12),
        item('AP-45','medic504','missing',13),
        item('AP-58','station4','issue',14)
    ],url:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/12/item'});
    let q=h.queue(h.scan);
    q.phase='native_form_opened';
    h.sessionStorage.setItem(key,JSON.stringify(q));
    assert.throws(()=>h.advance(q,false),/Confirm/);
    assert.equal(h.get().navigated,'');
    let result=h.advance(q,true);
    assert.deepEqual(result,{done:false,index:1,count:1});
    assert.equal(h.get().navigated,'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/13/item');
    q=h.read();
    assert.equal(q.index,1);
    assert.equal(q.phase,'open_item');
    assert.equal(q.operatorConfirmed[0].officialReceiptVerified,false);
    h.location.href='https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/13/item';
    q.phase='native_form_opened';
    h.sessionStorage.setItem(key,JSON.stringify(q));
    result=h.advance(q,true);
    assert.deepEqual(result,{done:false,index:2,count:2});
    assert.equal(h.get().navigated,'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/14/item');
    h.location.href='https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/14/item';
    q=h.read();
    q.phase='native_form_opened';
    h.sessionStorage.setItem(key,JSON.stringify(q));
    result=h.advance(q,true);
    assert.deepEqual(result,{done:true,count:3});
    assert.equal(h.get().stored,undefined);
    assert.equal(h.get().summary.items.length,3);
    assert.equal(h.get().summary.operatorReportedOnly,true);
    assert.equal(h.get().summary.officialReceiptVerified,false);
    assert.equal(h.get().summary.items[1].requestedResult,'missing');
});
test('cannot advance a native SCBA item without its own Start Inspection',()=>{
    const h=harness({url:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/12/item'});
    const q=h.queue(h.scan);
    assert.throws(()=>h.advance(q,true),/not been opened/);
    assert.equal(h.get().summary,null);
});
test('cannot mark a different SCBA asset as confirmed',()=>{
    const h=harness({url:'https://app.vectorcheckit.us/app/equipment/Standard/pool/299946/999/item'});
    const q={...h.queue(h.scan),phase:'native_form_opened'};
    assert.throws(()=>h.advance(q,true),/exact SCBA asset/);
    assert.equal(h.get().summary,null);
});
