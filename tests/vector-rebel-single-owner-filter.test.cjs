'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=s.indexOf('function responsiblePartySelectionLabels('),b=s.indexOf('async function scanPpeByResponsibleParty(',a);
const code=s.slice(a,b)+';return {responsiblePartySelectionLabels,exactlyOneResponsiblePartySelected}';
const make=(people,nested=[])=>{
const box={textContent:people.join(' '),querySelectorAll:()=>[
...people.map(textContent=>({textContent,parentElement:{closest:()=>null}})),
...nested.map(textContent=>({textContent,parentElement:{closest:()=>true}}))]};
const input={parentElement:{parentElement:box}};
const f=new Function('visible','masterNameKey','clean',code)(
()=>true,v=>String(v||'').toLowerCase().trim(),v=>String(v||'').trim());
return {input,f};};
test('Baldree-only check rejects Brandon Barth or both selected people',()=>{
for(const [people,expected] of [
[['Michael Baldree'],true],[['Brandon Barth'],false],
[['Michael Baldree','Brandon Barth'],false], [[],false]
]){
const {input,f}=make(people);
assert.equal(f.exactlyOneResponsiblePartySelected(input,'michael baldree'),expected);
}});
test('Nested React-select chip labels do not count twice',()=>{
const {input,f}=make(['Michael Baldree'],['Michael Baldree','×']);
assert.equal(f.responsiblePartySelectionLabels(input).length,1);
assert.equal(f.exactlyOneResponsiblePartySelected(input,'michael baldree'),true);
});
test('Filter must have sole matching chip immediately before Apply',()=>{
const x=s.slice(b,s.indexOf('async function scanPpeOwnerSearch(',b));
assert.ok(x.includes('if (!exactlyOneResponsiblePartySelected(input, ownerKey))'));
assert.ok(x.indexOf('if (!exactlyOneResponsiblePartySelected(input, ownerKey))')<x.indexOf('apply.click()'));
assert.ok(!x.includes('shortSurname'));
});