'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function piece(start,end) {
  const i=source.indexOf('    '+start),j=source.indexOf('    '+end,i+1);
  assert.ok(i>=0&&j>i,start+' boundaries');
  return source.slice(i,j);
}
const script=[
  piece('function masterNameKey(value) {','function expectedSurnamePrefix(name) {'),
  piece('function ownerRosterKey(name) {','function rosterNeedsReview(people) {'),
  piece('function getActiveMasterRoster() {','function saveLocalMasterRoster(people, metadata = {}) {'),
  piece('function rosterPersonByPrefix(prefix) {','function masterRosterExportPayload(people = getMasterRosterState().people) {')
].join('\n')+'\nreturn {getActiveMasterRoster,rosterPersonByPrefix,resolveCaptainSetPeople,ownerRosterKey};';
const clean=v=>String(v??'').trim();
function build(master,peopleDir=[]) {
 const getMasterRosterState=()=>({people:master});
 const getConfig=()=>({peopleDirectory:peopleDir});
 return new Function('clean','getMasterRosterState','getConfig',script)(
   clean,getMasterRosterState,getConfig
 );
}
const old=[
 {name:'Michael Brion',prefix:'BRION',active:true},
 {name:'Christopher Hoogerwerf',prefix:'M',active:true},
 {name:'Daniel Guerra-Herrera',prefix:'WS0122',active:true},
 {name:'Retired Employee',prefix:'RETIRED',active:false}
];
test('Existing legacy roster remains selectable as names but not as equipment-prefix ownership',()=>{
 const api=build(old);
 const roster=api.getActiveMasterRoster();
 assert.equal(roster.length,3);
 assert.ok(roster.every(p=>p.prefix.startsWith('PERSON-')));
 assert.ok(!roster.some(p=>p.prefix==='M'||p.prefix==='WS0122'));
 assert.equal(api.rosterPersonByPrefix('M').name,'Christopher Hoogerwerf');
 assert.notEqual(api.rosterPersonByPrefix('M').prefix,'M');
 assert.equal(api.rosterPersonByPrefix('RETIRED'),null);
});
test('Legacy Captain Set members resolve once each to the correct PERSON names',()=>{
 const api=build(old);
 const set={memberPrefixes:['BRION','M','WS0122','M']};
 const crew=api.resolveCaptainSetPeople(set);
 assert.deepEqual(crew.map(p=>p.name),['Michael Brion','Christopher Hoogerwerf','Daniel Guerra-Herrera']);
 assert.equal(new Set(crew.map(p=>p.prefix)).size,3);
});
test('After master rebuild, existing legacy Captain Set identity comes from saved name, not gear ID',()=>{
 const original=build(old),newMaster=original.getActiveMasterRoster().map(({legacyPrefix,...p})=>p);
 const api=build(newMaster,old);
 const crew=api.resolveCaptainSetPeople({memberPrefixes:['BRION','WS0122']});
 assert.deepEqual(crew.map(p=>p.name),['Michael Brion','Daniel Guerra-Herrera']);
 assert.ok(crew.every(p=>p.prefix.startsWith('PERSON-')));
});
test('A legacy identifier with no unique matching active person stays unresolved, never silently replaced',()=>{
 const api=build([{name:'Michael Brion',prefix:'PERSON-'+ '0'.repeat(16),active:true}],[
 {name:'Another Person',prefix:'BRION'}
 ]);
 assert.equal(api.rosterPersonByPrefix('BRION'),null);
 assert.deepEqual(api.resolveCaptainSetPeople({memberPrefixes:['BRION']}),[]);
 assert.match(source,/set\.people\.length === set\.memberCount/);
 assert.match(source,/legacy\/unresolved key\(s\): edit before use/);
});
test('Production actions still require physical confirmation and one-time submit verification',()=>{
 assert.match(source,/I, \$\{escapeHtml\(config\.inspectorName\)\}, physically inspected/);
 assert.match(source,/if \(!certBox\.checked\)/);
 assert.match(source,/if \(\(q1 === 'fail' \|\| q2 === 'fail'\) && !failureNote\)/);
 assert.match(source,/run\.submittedAt = Date\.now\(\)/);
 assert.match(source,/if \(run\.phase === 'submitted'\)/);
 assert.match(source,/await waitForFinalCompletion\(run\)/);
 assert.match(source,/Do NOT press START again/);
});
