'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=source.indexOf("const PPE_REPAIR_PEOPLE_KEY='vr_ppe_repair_people_v1'");
const end=source.indexOf('function showPpeCleanRepairForm()',start);
assert.ok(start>0&&end>start,'User-independent person picker helpers must be bundled');
const saved={};
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const key=s=>clean(s).toLowerCase();
const rosterKey=s=>'PERSON-'+key(s).replace(/[^a-z]+/g,'-');
const bad=s=>['equipment','everyone','department'].includes(key(s));
const fns=new Function('clean','masterNameKey','ownerRosterKey',
    'isOrganizationOrBadRosterName','loadJSON','saveJSON',
    source.slice(start,end)+
    ';return {repairPersonChoices,repairSavedPersonNames,repairSavePersonName};')(
    clean,key,rosterKey,bad,
    (k,fallback)=>saved[k]||fallback,
    (k,val)=>{saved[k]=val;}
);
test('A fresh installation with an empty master roster still offers its own Profile person',()=>{
 const choices=fns.repairPersonChoices([],[], 'Jared Weston', []);
 assert.equal(choices.length,1);
 assert.equal(choices[0].name,'Jared Weston');
 assert.match(choices[0].prefix,/^PERSON-/);
});
test('A fully unconfigured installation can add exact first and last name, then remembers it',()=>{
 assert.deepEqual(fns.repairPersonChoices([],[], '', []),[]);
 const first=fns.repairSavePersonName('Jared Weston');
 assert.equal(first.name,'Jared Weston');
 assert.deepEqual(fns.repairSavedPersonNames(),[{name:'Jared Weston'}]);
 assert.equal(fns.repairPersonChoices([],[], '',fns.repairSavedPersonNames()).length,1);
});
test('Personal profile plus admin roster plus added names are deduplicated by full name',()=>{
 const people=fns.repairPersonChoices(
    [{name:'Michael Brion',prefix:'BRION'}],
    [{name:'Jared Weston',prefix:'WESTON'}],
    'Jared Weston',
    [{name:'JARED WESTON'},{name:'Robert Brooks'}]);
 assert.equal(people.length,3);
 assert.deepEqual(people.map(p=>key(p.name)),
    ['jared weston','michael brion','robert brooks']);
 assert.throws(()=>fns.repairSavePersonName('Weston'),/first and last/);
 assert.throws(()=>fns.repairSavePersonName('Equipment'),/first and last/);
 assert.equal(fns.repairSavedPersonNames().length,1);
});
test('Form selection uses name identity, never a legacy gear prefix',()=>{
 const fn=source.slice(source.indexOf('function showPpeCleanRepairForm()'),
   source.indexOf('function installPanel()',source.indexOf('function showPpeCleanRepairForm()')));
 assert.match(fn,/const roster=repairPersonChoices\(getActiveMasterRoster\(\)/);
 assert.match(fn,/if\(me\)selection\.add\(myName\)/);
 assert.match(fn,/selection\.has\(masterNameKey\(p\.name\)\)/);
 assert.match(fn,/const person=repairSavePersonName\(clean\(manualName\.value\)\)/);
 assert.match(fn,/box\.append\(h,info,note,controls,manualRow,list,footer,status,review\)/);
 assert.match(fn,/scanPpeByResponsibleParty\(person\.name/);
 assert.doesNotMatch(fn,/selection\.has\(p\.prefix\)/);
});
test('Manual names are only choices; live Vector must verify exact Responsible Party before PDF generation',()=>{
 assert.match(source,/if \(masterNameKey\(item\.ownerName\) !== ownerKey\)/);
 assert.match(source,/No partial workbook was produced/);
 assert.match(source,/verified Responsible Party/i);
});
