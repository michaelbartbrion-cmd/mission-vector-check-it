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
    assert.match(src,/^\/\/ @version\s+3\.2\.54/m);
    assert.match(src,/const SCBA_AIRPACK_DRAFT_KEY = 'vector-rebel-station4-airpack-draft-v1'/);
    const check=cut('function showStation4ScbaAirpackCheck() {','function installPanel() {');
    assert.match(check,/makeOverlayBox\('830px'\)/);
    assert.match(check,/Find SCBA Airpacks/);
    assert.match(check,/Open Equipment > Standard/);
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
test('native location filters must all be present, missing selections are called out',()=>{
    const code=cut('function scbaAirpackFilterScope() {',
        'function isScbaAirpackStandardItem(item) {')+'\nreturn scbaAirpackFilterScope;';
    const app=documentText=>({querySelectorAll(){return [{
        innerText:documentText,closest:()=>null
    }];},body:{innerText:documentText}});
    const create=new Function('SCBA_AIRPACK_LOCATIONS','document','PANEL_ID','OVERLAY_ID',code);
    const all='Equipment Standard Search: Filtered To: Station 4 SCBA Supply Room × '+
        'Truck 504: 63000-13 × Medic 504: 61000-12 × Name Pool Location';
    const evaluate=text=>create(locations,app(text),'vector-ppe-helper-v23','vector-ppe-overlay-v23')();
    assert.deepEqual(evaluate(all).selected,['truck504','medic504','station4']);
    assert.equal(evaluate(all).ready,true);
    const incomplete=evaluate(all.replace('Medic 504: 61000-12','Medic 506: 61000-16'));
    assert.equal(incomplete.ready,false);
    assert.deepEqual(incomplete.missing,['Medic 504: 61000-12']);
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
    const code=cut('async function scbaAirpackReadInventory(report) {',
        'function showStation4ScbaAirpackCheck() {')+'\nreturn scbaAirpackReadInventory;';
    const fn=new Function('scbaAirpackBusy','getRun','scbaAirpackFilterScope',
        'scbaAirpackStandardTable','scbaAirpackRange','getPaginationControl',
        'paginationControlEnabled','scbaAirpackNativeSignature',
        'scbaAirpackWaitForPageChange','scbaAirpackVisibleRows',
        'scbaAirpackWaitForCompletePage',code)(
            false,()=>null,()=>({ready:true,selected:locations.map(x=>x.id)}),
            ()=>({table:{}}),range,
            type=>({disabled: type==='previous'?page===0:page===2,
                click(){page+=type==='next'?1:-1;}}),
            btn=>!btn.disabled,()=>signatures[page],async()=>range(),
            ()=>[scopes[page]],async()=>true
        );
    const result=await fn(()=>{});
    assert.equal(result.complete,true);
    assert.equal(result.pages,3);
    assert.equal(result.totalRows,25);
    assert.equal(result.items.length,3);
    assert.deepEqual(result.items.map(x=>x.scope),['truck504','medic504','station4']);
    assert.doesNotMatch(code,/\bfetch\(|GM_xmlhttpRequest\(|submitInspection\(|\.submit\(/);
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
