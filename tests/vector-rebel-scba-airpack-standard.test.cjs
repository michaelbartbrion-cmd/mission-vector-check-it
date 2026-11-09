'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const cut=(begin,end)=>{
    const a=src.indexOf('    '+begin),b=src.indexOf('    '+end,a+begin.length);
    assert.ok(a>=0&&b>a,'missing '+begin+' / '+end);
    return src.slice(a,b);
};
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const locations=[
    {id:'truck504',location:'Truck 504: 63000-13',exact:/^Truck 504\s*:\s*63000-13$/i},
    {id:'medic504',location:'Medic 504: 61000-12',exact:/^Medic 504\s*:\s*61000-12$/i},
    {id:'station4',location:'Station 4 SCBA Supply Room',exact:/^Station 4 SCBA Supply Room$/i}
];
test('airpack check is independently available in existing Vector Rebel panel',()=>{
    assert.match(src,/mainAction\('SCBA Airpacks', showStation4ScbaAirpackCheck, false\)/);
    assert.match(src,/mainAction\('My Tour PPE',/);
    assert.match(src,/^\/\/ @version\s+3\.2\.56/m);
    assert.match(src,/const SCBA_AIRPACK_DRAFT_KEY = 'vector-rebel-station4-airpack-draft-v1'/);
    const check=cut('function showStation4ScbaAirpackCheck() {','function installPanel() {');
    assert.match(check,/makeOverlayBox\('830px'\)/);
    assert.match(check,/Find SCBA Airpacks/);
    assert.doesNotMatch(check,/makeButton\('Set Vector Filters'\)/);
    assert.match(check,/scbaAirpackEnsureNativeFilters\(chosen/);
    assert.match(check,/Locations to check today/);
    assert.match(check,/type='checkbox'/);
    assert.match(check,/scbaAirpackPendingSelection\(\)/);
    assert.doesNotMatch(check,/sessionStorage\.setItem\(SCBA_AIRPACK_PENDING_SELECTION_KEY/);
    assert.match(check,/Save Local Draft/);
    assert.match(check,/draftOnly:true/);
    assert.match(check,/No SCBA inspection, inspection signature, or Vector check/);
    assert.doesNotMatch(check,/submitInspection\(|saveInspection\(|\.submit\(/);
});
test('only Truck 504, Medic 504 and Station 4 SCBA Supply Room are in scope',()=>{
    const code=cut('function scbaAirpackLocation(item) {','function scbaAirpackVisibleRows() {')+
        '\nreturn scbaAirpackLocation;';
    const fn=new Function('SCBA_AIRPACK_LOCATIONS','clean',code)(locations,clean);
    assert.equal(fn({location:'Truck 504: 63000-13'}).id,'truck504');
    assert.equal(fn({location:'Medic 504: 61000-12'}).id,'medic504');
    assert.equal(fn({location:'Station 4 SCBA Supply Room'}).id,'station4');
    assert.equal(fn({location:'Medic 506: 61000-16'}),null);
    assert.equal(fn({location:'Station 5 SCBA Supply Room'}),null);
    assert.equal(fn({location:'Truck 503: 63000-12'}),null);
});
test('SCBA mask, loose cylinder and charger are not airpacks',()=>{
    const code=cut('function isScbaAirpackStandardItem(item) {',
        'function scbaAirpackLocation(item) {')+'\nreturn isScbaAirpackStandardItem;';
    const fn=new Function('clean',code)(clean);
    for(const sample of [
        {name:'E004015306F73814',pool:'SCBA Air Pack'},
        {name:'Airpack 504-1',pool:'Standard Equipment'},
        {name:'123456',pool:'SCBA'},
        {name:'A1',pool:'SCBA Frame'},
        {name:'Self Contained Breathing Apparatus',pool:'Rescue'}
    ]) assert.equal(fn(sample),true,JSON.stringify(sample));
    for(const sample of [
        {name:'SCBA Face Mask: E004015306F73814',pool:'SCBA Face Mask'},
        {name:'SCBA Cylinder',pool:'SCBA'},
        {name:'SCBA Battery Charger',pool:'Charging'},
        {name:'SCBA Regulator',pool:'SCBA'},
        {name:'Boots',pool:'PPE'},
        {name:'2001',pool:'Chainsaw'}
    ]) assert.equal(fn(sample),false,JSON.stringify(sample));
});
test('native filters can be ONE, TWO or THREE of the requested locations, never force all three',()=>{
    const srcFn=cut('function scbaAirpackFilterScope(requestedIds=[]) {',
        'function isScbaAirpackStandardItem(item) {')+'\nreturn scbaAirpackFilterScope;';
    const app=text=>({querySelectorAll:()=>[{innerText:text,closest:()=>null}],
        body:{innerText:text}});
    const factory=new Function('SCBA_AIRPACK_LOCATIONS','document',
        'PANEL_ID','OVERLAY_ID',srcFn);
    const evaluate=(text,selected)=>factory(locations,app(
        'Equipment Standard Filtered To: '+text+' Name Pool Location'
    ),'vector-ppe-helper-v23','vector-ppe-overlay-v23')(selected);
    const truck='Truck 504: 63000-13';
    const medic='Medic 504: 61000-12';
    const room='Station 4 SCBA Supply Room';
    assert.equal(evaluate(truck,['truck504']).ready,true);
    assert.equal(evaluate(room,['station4']).ready,true);
    assert.equal(evaluate(truck+' × '+medic,['truck504','medic504']).ready,true);
    assert.equal(evaluate(truck+' × '+medic+' × '+room,
        ['truck504','medic504','station4']).ready,true);
    const missing=evaluate(truck,['truck504','medic504']);
    assert.equal(missing.ready,false);
    assert.deepEqual(missing.missing,[medic]);
    const extra=evaluate(truck+' × '+room,['truck504']);
    assert.equal(extra.ready,false);
    assert.deepEqual(extra.extra,[room]);
    assert.equal(evaluate(truck,[]).ready,false,'zero locations always rejected');
    assert.equal(evaluate('',['truck504']).ready,false,'no native filter chips rejected');
});
test('new SCBA check starts with nothing selected, unless resuming brief native-filter setup',()=>{
    const fnSource=cut('function scbaAirpackPendingSelection() {',
        'function scbaAirpackFilterScope(requestedIds=[]) {')+
        '\nreturn scbaAirpackPendingSelection;';
    const values=new Map();
    const sessionStorage={
        getItem:key=>values.get(key)||null,
        setItem:(key,v)=>values.set(key,v),
        removeItem:key=>values.delete(key)
    };
    const key='scba-location-setup-test';
    const f=new Function('SCBA_AIRPACK_LOCATIONS','sessionStorage',
        'SCBA_AIRPACK_PENDING_SELECTION_KEY',fnSource)(
            locations,sessionStorage,key);
    assert.deepEqual(f(),[]);
    sessionStorage.setItem(key,JSON.stringify({
        ids:['medic504','station4'],savedAt:Date.now()
    }));
    assert.deepEqual(f(),['medic504','station4']);
    sessionStorage.setItem(key,JSON.stringify({
        ids:['truck504'],savedAt:Date.now()-11*60*1000
    }));
    assert.deepEqual(f(),[]);
    assert.equal(sessionStorage.getItem(key),null);
});
test('Standard equipment rows read the native pool and location, not PPE links or title guesses',()=>{
    const srcFn=cut('function scbaAirpackVisibleRows() {','function scbaAirpackRange() {')+
        '\nreturn scbaAirpackVisibleRows;';
    const fakeRow=(name,pool,location,status,href)=>{
        const cells=[name,pool,location,'-',status].map(text=>({
            innerText:text,
            querySelector:()=>null
        }));
        cells[0].querySelector=()=>href?{getAttribute:()=>href}:null;
        return {querySelectorAll:()=>cells};
    };
    const rows=[
        fakeRow('AP-01','SCBA Air Pack','Truck 504: 63000-13','In Service','/main/equipment/123'),
        fakeRow('AP-02','SCBA Air Pack','Medic 504: 61000-12','In Service','/main/equipment/124'),
        fakeRow('AP-03','SCBA Air Pack','Station 4 SCBA Supply Room','In Service','/main/equipment/125'),
        fakeRow('MASK','SCBA Face Mask','Truck 504: 63000-13','In Service','/main/equipment/126'),
        fakeRow('AP-04','SCBA Air Pack','Truck 503: 63000-12','In Service','/main/equipment/127')
    ];
    const table={querySelectorAll:()=>rows};
    const detector=new Function('scbaAirpackStandardTable','clean','window','scbaAirpackLocation',
        'isScbaAirpackStandardItem',srcFn)(
            ()=>({table,labels:['name','pool','location','responsible party','item status']}),
            clean,{location:{origin:'https://app.vectorcheckit.us',
                href:'https://app.vectorcheckit.us/main/asset-manager'}},
            x=>locations.find(loc=>loc.exact.test(x.location))||null,
            x=>!/mask/i.test(x.name)&&/SCBA Air Pack/.test(x.pool)
        );
    const results=detector();
    assert.equal(results.length,3);
    assert.deepEqual(results.map(x=>x.scope),['truck504','medic504','station4']);
    assert.equal(results[0].href,'https://app.vectorcheckit.us/main/equipment/123');
});
test('inventory traversal is read-only apart from pagination and validates every page',async()=>{
    let page=0;
    const signatures=['a','b','c'];
    const scopes=[
        {scope:'truck504',name:'AP-01',pool:'SCBA Air Pack',location:'Truck 504: 63000-13',status:'In Service',href:'/abc'},
        {scope:'medic504',name:'AP-02',pool:'SCBA Air Pack',location:'Medic 504: 61000-12',status:'In Service',href:'/def'},
        {scope:'station4',name:'AP-03',pool:'SCBA Air Pack',location:'Station 4 SCBA Supply Room',status:'In Service',href:'/ghi'}
    ];
    const range=()=>({first:page*10+1,last:Math.min(page*10+10,25),total:25});
    const code=cut('async function scbaAirpackReadInventory(report, selectedIds) {',
        'function showStation4ScbaAirpackCheck() {')+'\nreturn scbaAirpackReadInventory;';
    const fn=new Function('scbaAirpackBusy','getRun','scbaAirpackFilterScope',
        'scbaAirpackStandardTable','scbaAirpackRange','getPaginationControl',
        'paginationControlEnabled','scbaAirpackNativeSignature',
        'scbaAirpackWaitForPageChange','scbaAirpackVisibleRows',
        'scbaAirpackWaitForCompletePage',code)(
            false,()=>null,ids=>({ready:true,requested:ids}),
            ()=>({table:{}}),range,
            type=>({disabled: type==='previous'?page===0:page===2,
                click(){page+=type==='next'?1:-1;}}),
            btn=>!btn.disabled,()=>signatures[page],async()=>range(),
            ()=>[scopes[page]],async()=>true
        );
    const result=await fn(()=>{},['truck504','medic504','station4']);
    assert.equal(result.complete,true);
    assert.equal(result.pages,3);
    assert.equal(result.totalRows,25);
    assert.equal(result.items.length,3);
    assert.deepEqual(result.items.map(x=>x.scope),['truck504','medic504','station4']);
    assert.doesNotMatch(code,/\bfetch\(|GM_xmlhttpRequest\(|submitInspection\(|\.submit\(/);
});

test('read-only scan returns only the chosen Truck scope, not Medic or station-room packs',async()=>{
    const source=cut('async function scbaAirpackReadInventory(report, selectedIds) {',
        'function showStation4ScbaAirpackCheck() {')+'\nreturn scbaAirpackReadInventory;';
    const all=[
        {scope:'truck504',name:'AP-T',pool:'SCBA',location:'Truck 504: 63000-13',status:'In Service',href:'/1'},
        {scope:'medic504',name:'AP-M',pool:'SCBA',location:'Medic 504: 61000-12',status:'In Service',href:'/2'}
    ];
    const fn=new Function('scbaAirpackBusy','getRun','scbaAirpackFilterScope',
        'scbaAirpackStandardTable','scbaAirpackRange','getPaginationControl',
        'paginationControlEnabled','scbaAirpackNativeSignature',
        'scbaAirpackWaitForPageChange','scbaAirpackVisibleRows',
        'scbaAirpackWaitForCompletePage',source)(
        false,()=>null,ids=>({ready:true,requested:ids}),
        ()=>({table:{}}),()=>({first:1,last:2,total:2}),
        ()=>null,()=>false,()=> 'two',async()=>{},
        ()=>all,async()=>true
    );
    const out=await fn(()=>{},['truck504']);
    assert.deepEqual(out.items.map(item=>item.name),['AP-T']);
    assert.deepEqual(out.scope,['truck504']);
    await assert.rejects(fn(()=>{},[]),/Choose at least one/);
});
test('page-readiness guard requires every native Standard row, not only matched airpacks',async()=>{
    const fn=new Function('scbaAirpackStandardTable','scbaAirpackRange',
        'scbaAirpackNativeSignature','clean','sleep',
        cut('async function scbaAirpackWaitForCompletePage(range,timeoutMs=14000) {',
            'function scbaAirpackNativeSignature() {')+
        '\nreturn scbaAirpackWaitForCompletePage;')(
        ()=>({table:{querySelectorAll:()=>[
            {querySelectorAll:()=>[
                {textContent:'A'},{textContent:'SCBA Air Pack'},
                {textContent:'Truck 504: 63000-13'},{textContent:''},{textContent:'In Service'}
            ]}
        ]},labels:['name','pool','location','responsible party','item status']}),
        ()=>({first:1,last:2,total:2}),()=> 'stable',clean,async()=>{}
    );
    await assert.rejects(fn({first:1,last:2,total:2},1),/did not finish loading/);
});

test('native filter control uses explicit checkbox or accessibility state, never guessed visual styling',()=>{
    const code=cut('function scbaAirpackNativeOptionState(node) {',
        'function scbaAirpackFindNativeFilterOption(loc) {')+
        '\nreturn scbaAirpackNativeOptionState;';
    const state=new Function(code)();
    const label={};
    const input={checked:false,closest:()=>label};
    const standard={matches:()=>false,querySelector:()=>input};
    assert.deepEqual(state(standard),{checked:false,control:label});
    input.checked=true;
    assert.deepEqual(state(standard),{checked:true,control:label});
    const role={getAttribute:name=>name==='aria-checked'?'false':null};
    const wrapper={matches:()=>false,querySelector:()=>role};
    assert.deepEqual(state(wrapper),{checked:false,control:role});
    const unknown={matches:()=>false,querySelector:()=>({getAttribute:()=>null})};
    assert.equal(state(unknown),null);
});
test('Find SCBA automatically opens native Filters, corrects selected locations and confirms native chips',async()=>{
    const source=cut('async function scbaAirpackEnsureNativeFilters(selectedIds,report) {',
        'function isScbaAirpackStandardItem(item) {')+
        '\nreturn scbaAirpackEnsureNativeFilters;';
    const active=new Set(['station4']);
    const applied=new Set(['station4']);
    const actions=[];
    let popup=false;
    const scope=ids=>({
        ready:ids.length>0 &&
            ids.every(x=>applied.has(x)) &&
            [...applied].every(x=>ids.includes(x)),
        selected:[...applied],requested:ids,missing:[],extra:[]
    });
    const option=loc=>popup ? {
        checked:active.has(loc.id),
        control:{click(){
            actions.push('toggle:'+loc.id);
            if(active.has(loc.id))active.delete(loc.id);else active.add(loc.id);
        }}
    }:null;
    const apply={innerText:'Apply Filters',closest:()=>null,
        click(){actions.push('apply');applied.clear();for(const x of active)applied.add(x);}};
    const document={querySelectorAll:selector=>
        selector==='button,[role="button"]'?[apply]:[]};
    const open={click(){actions.push('open');popup=true;}};
    const fn=new Function('getRun','scbaAirpackStandardTable',
        'scbaAirpackFilterScope','findVectorNavigationTarget','visible','sleep',
        'SCBA_AIRPACK_LOCATIONS','scbaAirpackFindNativeFilterOption','document',
        'clean','PANEL_ID','OVERLAY_ID',source)(
            ()=>null,()=>({table:{}}),scope,()=>open,()=>true,async()=>{},
            locations,option,document,clean,'rebel-panel','rebel-overlay');
    const messages=[];
    await fn(['truck504','medic504'],message=>messages.push(message));
    assert.deepEqual(actions,[
        'open','toggle:truck504','toggle:medic504','toggle:station4','apply'
    ]);
    assert.deepEqual([...applied].sort(),['medic504','truck504']);
    assert.equal(scope(['truck504','medic504']).ready,true);
    const before=actions.length;
    await fn(['truck504','medic504']);
    assert.equal(actions.length,before,'no repeated filter clicks when already selected');
});
test('SCBA auto-filter refuses unknown native controls rather than guessing or scanning all inventory',async()=>{
    const source=cut('async function scbaAirpackEnsureNativeFilters(selectedIds,report) {',
        'function isScbaAirpackStandardItem(item) {')+
        '\nreturn scbaAirpackEnsureNativeFilters;';
    let scans=0,opens=0;
    const fn=new Function('getRun','scbaAirpackStandardTable',
        'scbaAirpackFilterScope','findVectorNavigationTarget','visible','sleep',
        'SCBA_AIRPACK_LOCATIONS','scbaAirpackFindNativeFilterOption','document',
        'clean','PANEL_ID','OVERLAY_ID',source)(
            ()=>null,()=>{scans++;return {table:{}};},
            ids=>({ready:false,selected:[],missing:ids,extra:[],requested:ids}),
            ()=>({click(){opens++;}}),()=>true,async()=>{},
            locations,()=>null,{querySelectorAll:()=>[]},clean,'rebel-panel','rebel-overlay');
    await assert.rejects(fn(['truck504']),/Cannot identify the native checkbox/);
    assert.equal(opens,1);
    assert.equal(scans,1,'only the read-only table preflight was done');
});
