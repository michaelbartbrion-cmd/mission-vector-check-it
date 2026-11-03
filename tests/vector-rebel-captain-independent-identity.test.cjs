'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const extract=(start,end)=>{
    const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
    assert.ok(a>0&&b>a,'Source section not found: '+start);
    return src.slice(a,b);
};
const clean=value=>String(value||'').trim();
const nameKey=value=>clean(value).toLowerCase();
const ownerKey=value=>'PERSON-'+clean(value).toUpperCase().replace(/[^A-Z0-9]+/g,'-');
const config={inspectorName:'Michael Baldree',peopleDirectory:[],captainSets:[]};
const newPeople=[{name:'Jared Weston'},{name:'Jerry Weems'}];
const captainFn=extract('function getCaptainPersonOptions() {','function masterRosterExportPayload(');
const cap=new Function('getConfig','getActiveMasterRoster','getMasterRosterState','normalizePeopleDirectory',
    'repairSavedPersonNames','isOrganizationOrBadRosterName','clean','masterNameKey','ownerRosterKey',
    captainFn+';return {getCaptainPersonOptions,rosterPersonByPrefix,resolveCaptainSetPeople};')(
    ()=>config,()=>[],()=>({source:'local-admin'}),v=>v,()=>newPeople,()=>false,clean,nameKey,ownerKey
);
test('Daily Captain Check works with no master roster on a newly installed browser',()=>{
    const opts=cap.getCaptainPersonOptions();
    assert.equal(opts.length,3);
    assert.ok(opts.some(p=>p.name==='Michael Baldree'));
    assert.ok(opts.some(p=>p.name==='Jared Weston'));
    const set={memberPrefixes:[ownerKey('Michael Baldree'),ownerKey('Jared Weston')]};
    const resolved=cap.resolveCaptainSetPeople(set,config);
    assert.deepEqual(resolved.map(p=>p.name),['Michael Baldree','Jared Weston']);
});
test('A crew person selected locally is re-resolved without a shared master roster',()=>{
    assert.equal(cap.rosterPersonByPrefix(ownerKey('Jerry Weems')).name,'Jerry Weems');
    assert.equal(cap.rosterPersonByPrefix('UNMATCHED-PREFIX'),null);
});
test('New Captain Set and person-name entry do not depend on roster availability',()=>{
    assert.match(src,/const roster = getCaptainPersonOptions\(\);/);
    assert.match(src,/newSet\.disabled = false;/);
    assert.match(src,/makeButton\('Add to Captain Set'/);
    assert.match(src,/repairSavePersonName\(clean\(addCrewName\.input\.value\)\)/);
    assert.match(src,/const unknown = \[\.\.\.selected\]\.filter\(prefix => !roster\.some/);
    assert.match(src,/const person = roster\.find\(p=>p\.prefix===prefix\)\|\|/);
    assert.match(src,/const usableSets = \(config\.captainSets \|\| \[\]\)/);
    assert.match(src,/scanPpeByResponsibleParty\(owner\.name/);
});
function makeChecker({heading='Bunker Coat',serial='16642722',route=true}={}){
    const title={textContent:heading,isConnected:true,closest:()=>null};
    const content={textContent:'',isConnected:true,closest:()=>null};
    const mockDocument={
        body:content,
        querySelectorAll(selector){
            if(selector==='h1,h2,h3,h4,[data-testid*="title"]')return [title];
            if(selector.includes('data-testid'))return [title];
            return [];
        },
        querySelector(selector){return selector==='main'?content:selector==='h1'?title:null;}
    };
    const location={href:'https://app.vectorcheckit.us/app/equipment/PPE/pool/300045/4604970/item'};
    const checker=new Function('document','location','clean','visible','uiText','isAssetPageFor',
        'repairReadDetailDocument','escapeRegex','PANEL_ID','OVERLAY_ID',
        extract('let identityElementCache =','async function verifyExpectedAssetPage(')+
        '; return {findAssetIdentityElement,assetPageContainsExpectedId,findAssetSerialEvidence};')(
        mockDocument,location,clean,()=>true,clean,()=>route,()=>({serial}),
        value=>value,'vector-panel','vector-overlay'
    );
    return checker;
}
const example={assetId:'BALDREE-16642722-BU',pool:'300045',itemId:'4604970',serial:''};
test('PPE identity can be confirmed by serial only when exact pool/item route and serial match',()=>{
    assert.ok(makeChecker().findAssetIdentityElement(example));
    assert.equal(makeChecker({serial:'16642723'}).findAssetIdentityElement(example),null);
    assert.equal(makeChecker({route:false}).findAssetIdentityElement(example),null);
});
test('A conflicting equipment title still stops the PPE inspection',()=>{
    assert.equal(makeChecker({heading:'Bunker Coat: OTHER-16642722-BU'}).findAssetIdentityElement(example),null);
});
test('Full PPE name in a long heading is recognized without a serial number',()=>{
    const value='Bunker Coat: '+example.assetId+' '+('additional details '.repeat(18));
    assert.ok(makeChecker({heading:value,serial:''}).findAssetIdentityElement(example));
    assert.equal(makeChecker({heading:'Bunker Coat: '+example.assetId+'-NOTTHIS',serial:''}).findAssetIdentityElement(example),null);
});
test('Identity verifier remains read-only and retries after delayed Vector rendering',()=>{
    assert.match(src,/await waitFor\(\(\) => findAssetIdentityElement\(item\), 18000, 180\)/);
    assert.match(src,/No inspection was started\. Open DIAGNOSTICS and share the report\./);
    assert.doesNotMatch(extract('function findAssetSerialEvidence(item) {','async function verifyExpectedAssetPage('),/\.click\(\)|fetch\(/);
});
