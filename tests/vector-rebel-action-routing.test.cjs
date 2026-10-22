'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const functions=new Map();
const expressions=[...script.matchAll(/^    (?:async )?function ([A-Za-z_$][\w$]*)\([^)]*\)\s*\{/gm)];
for(let i=0;i<expressions.length;i++) {
 const from=expressions[i].index;
 const to=i+1<expressions.length?expressions[i+1].index:script.length;
 functions.set(expressions[i][1],script.slice(from,to));
}
function body(name){assert.ok(functions.has(name),'Function exists: '+name);return functions.get(name);}
function reachable(entry){
 const seen=new Set(),queue=[entry];
 while(queue.length){
   const current=queue.pop();
   if(seen.has(current))continue;
   const b=body(current);
   seen.add(current);
   for(const name of functions.keys()){
     if(name!==current&&new RegExp('\\b'+name+'\\s*\\(').test(b.replace(/\/\/[^\r\n]*/g,'')))queue.push(name);
   }
 }
 return seen;
}
const actions=[
 ['My Tour PPE','launchMyInspectionFromAnywhere'],
 ['My After-Fire','launchMyInspectionFromAnywhere'],
 ["Captain's Monthly",'launchCaptainInspectionFromAnywhere'],
 ['Daily Captain Check','launchCaptainDailyCheckFromAnywhere']
];
test('All four visible action buttons have the expected entrypoint',()=>{
 assert.match(script,/mainAction\('My Tour PPE', \(\) => launchMyInspectionFromAnywhere\('tour'\)\)/);
 assert.match(script,/mainAction\('My After-Fire', \(\) => launchMyInspectionFromAnywhere\('afterFire'\)\)/);
 assert.match(script,/mainAction\("Captain's Monthly", launchCaptainInspectionFromAnywhere\)/);
 assert.match(script,/mainAction\('Daily Captain Check', launchCaptainDailyCheckFromAnywhere, false\)/);
});
test('No inspection/audit button can reach a full department PPE crawl',()=>{
 for(const [label,entry] of actions){
   const seen=reachable(entry);
   assert.ok(!seen.has('scanPpeOwnerInventory'),label+' must not scan entire department');
   assert.ok(!seen.has('scanPpeRosterCandidates'),label+' must not invoke master roster rebuild');
 }
});
test('Full department crawl is used only for explicitly requested roster refresh',()=>{
 const usages=[...script.matchAll(/\bscanPpeOwnerInventory\s*\(/g)].filter(m=>{
  const line=script.slice(script.lastIndexOf('\n',m.index)+1,script.indexOf('\n',m.index));
  return !line.trim().startsWith('//');
 });
 assert.equal(usages.length,2,'one definition and one intentional caller');
 assert.match(body('scanPpeRosterCandidates'),/await scanPpeOwnerInventory\(progress\)/);
 const admin=body('showSettings');
 assert.match(admin,/scanPpeRosterCandidates\(message =>/);
});
test('Daily Captain history audit is read-only and still reaches the item-history reader',()=>{
 const daily=body('startCaptainDailyCheck');
 const resume=body('resumeCaptainDailyCheck');
 assert.match(daily,/await scanPpeCrewOwners\(owners,/);
 assert.match(resume,/readCaptainComplianceHistory\(item\)/);
 assert.doesNotMatch(daily+resume,/click\(\s*Submit Inspection\s*\)|submitInspection\s*\(/);
});
test('Monthly and personal gear discovery remain independent and bounded',()=>{
 const preview=body('buildPreview');
 assert.match(preview,/modeKey === 'tour' \|\| modeKey === 'afterFire'/);
 assert.match(preview,/scanPpeOwnerSearch\(owners\[0\]/);
 assert.match(preview,/scanPpeCrewOwners\(owners,/);
 assert.doesNotMatch(preview,/scanPpeOwnerInventory\(/);
});
test('Obsolete equipment-prefix helpers are not wired into any main action',()=>{
 for(const name of ['searchPrefix','searchPpeByPrefix','searchPpeForRosterReview','findActualPpePrefixCandidates']){
   for(const [,entry] of actions)assert.ok(!reachable(entry).has(name),entry+' must not reach '+name);
 }
});
