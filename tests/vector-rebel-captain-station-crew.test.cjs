'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    async function readCaptainStationCrew('),b=src.indexOf('    function getCaptainPersonOptions()',a);
assert.ok(a>0&&b>a,'real station crew source');
const code=src.slice(a,b);
function factory({status=200,body,paired=true,roster}={}){
 let sent=[],requests=0;
 const people=roster||[{name:'Michael Brion',prefix:'PERSON-BRION'},
 {name:'Robert Brooks',prefix:'PERSON-BROOKS'}];
 const response=body||{ok:true,readOnly:true,scope:'vector-rebel-dated-station-crew',
   shift:'C',station:4,snapshotDate:'2026-11-10',sourceCount:3,
   people:people,unresolved:['Baldree, Mike']};
 const fn=new Function('captainShiftLabel','rebelCommandPaired',
  'ensureRebelCommandEnrollment','rebelCommandPairing','GM_xmlhttpRequest',
  'REBEL_COMMAND_ENDPOINT','getCaptainPersonOptions','clean','masterNameKey',
  code+'\nreturn readCaptainStationCrew;')(
  s=>['A','B','C'].includes(s)?s:'C',()=>paired,async()=>false,
  ()=>({token:'TOKEN',deviceId:'DEVICE'}),
  x=>{requests++;sent.push(x);x.onload({status,responseText:JSON.stringify(response)});},
  'https://example.test/bridge',()=>people,
  s=>String(s||'').trim(),s=>String(s||'').trim().toLowerCase()
 );
 return{fn,sent,requestCount:()=>requests};
}
test('selected crew is fetched only on explicit request and verified against approved names',async()=>{
 const x=factory();assert.equal(x.requestCount(),0);
 const r=await x.fn('C',4);
 assert.equal(x.requestCount(),1);
 assert.equal(r.people.length,2);
 assert.deepEqual(r.unresolved,['Baldree, Mike']);
 assert.match(x.sent[0].url,/action=vr-station-crew&shift=C&station=4/);
 assert.equal(x.sent[0].headers['X-Rebel-Device-ID'],'DEVICE');
});
test('failed authentication or incomplete provenance never returns a staged roster',async()=>{
 const denied=factory({status:403,body:{ok:false,error:'Unauthorized'}});
 await assert.rejects(denied.fn('C',4),/Unauthorized/);
 const invalid=factory({body:{ok:true,readOnly:true,
   scope:'vector-rebel-dated-station-crew',shift:'C',station:4,
   snapshotDate:'2026-11-09',sourceCount:0,people:[],unresolved:[]}});
 await assert.rejects(invalid.fn('C',4),/inconsistent/);
 const unpaired=factory({paired:false});
 await assert.rejects(unpaired.fn('C',4),/Connect Rebel Command/);
 assert.equal(unpaired.requestCount(),0);
});
test('wrong approved person name and duplicate prefix abort population',async()=>{
 const wrong=factory({body:{ok:true,readOnly:true,scope:'vector-rebel-dated-station-crew',
   shift:'C',station:4,snapshotDate:'2026-11-10',sourceCount:1,
   people:[{name:'Robert Brooks',prefix:'PERSON-BRION'}],unresolved:[]}});
 await assert.rejects(wrong.fn('C',4),/unresolved Vector identity/);
 const duplicate=factory({body:{ok:true,readOnly:true,scope:'vector-rebel-dated-station-crew',
   shift:'C',station:4,snapshotDate:'2026-11-10',sourceCount:2,
   people:[{name:'Michael Brion',prefix:'PERSON-BRION'},
     {name:'Michael Brion',prefix:'PERSON-BRION'}],unresolved:[]}});
 await assert.rejects(duplicate.fn('C',4),/unresolved Vector identity/);
});
test('Captain Settings shows preview, unresolved identities and an explicit, non-saving Apply action',()=>{
 const settings=src.slice(src.indexOf('            function renderEditor() {'),
   src.indexOf('            newSet.onclick = () => {'));
 assert.match(settings,/makeButton\('Preview Crew'/);
 assert.match(settings,/makeButton\('Use Matched Crew'/);
 assert.match(settings,/await readCaptainStationCrew\(/);
 assert.match(settings,/result\.unresolved\.join\(', '\)/);
 assert.match(settings,/selected\.clear\(\)/);
 assert.match(settings,/confirm\('Replace this draft Captain Set selection/);
 assert.match(settings,/Review personnel off, swaps and transfers before saving/);
 const saveIndex=settings.indexOf("const save = makeButton('Save Captain Set'");
 assert.ok(saveIndex>settings.indexOf('applyCrew.onclick='));
 assert.doesNotMatch(settings.slice(settings.indexOf('applyCrew.onclick='),saveIndex),
   /saveConfig\(/,'applying suggestion must not itself persist a Captain Set');
});
