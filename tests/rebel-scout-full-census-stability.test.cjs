'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-scout.user.js'),'utf8');
const range=(a,b)=>{
 const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,a+' function boundaries');
 return src.slice(i,j);
};
const helper=range('function censusFingerprint(rows){','async function performScrape(options={})');
function setup(sequence,{loading=false,date='2027-07-29'}={}){
 let observedDate=date,loadingState=loading,index=0;
 const hash32=x=>String(x);
 const wait=async()=>{};
 const sweep=async()=>sequence[Math.min(index++,sequence.length-1)];
 const code=new Function('hash32','wait','sweep','loadingVisible','domDisplayedDate',
   helper+'\nreturn independentlyVerifyStableRoster;');
 return {verify:code(hash32,wait,sweep,()=>loadingState,()=>observedDate),
  setDate:v=>observedDate=v,setLoading:v=>loadingState=v};
}
const roster={rows:[{personId:'1',assignmentGroup:'Truck 504',rawText:'Jones Salary Step [1010] 07:00 - 07:00',lengthHours:24},
{personId:'2',assignmentGroup:'Engine 504',rawText:'Smith Salary Step [1010] 07:00 - 07:00',lengthHours:24}],scrollSweepComplete:true};
test('Repeated exact complete census can confirm stability when unrelated DOM continues animating',async()=>{
 const h=setup([{...roster,rows:[...roster.rows].reverse()}]);
 assert.equal(await h.verify('2027-07-29',roster),true);
});
test('Changed staffing content must remain partial, not automatically verified',async()=>{
 const change={...roster,rows:[roster.rows[0],{...roster.rows[1],rawText:'new 07:00 - 07:00'}]};
 assert.equal(await setup([change]).verify('2027-07-29',roster),false);
});
test('Incomplete scroll, loading overlay, or changed date invalidates independent verification',async()=>{
 assert.equal(await setup([{...roster,scrollSweepComplete:false}]).verify('2027-07-29',roster),false);
 assert.equal(await setup([roster],{loading:true}).verify('2027-07-29',roster),false);
 assert.equal(await setup([roster],{date:'2027-07-30'}).verify('2027-07-29',roster),false);
});
test('Core collector transmits snapshot verification evidence and retains every census guard',()=>{
 const main=range('async function performScrape(options={})','function scrapeNow(options={})');
 assert.match(main,/independentlyStable=\(!stableBefore\|\|!stableAfter\)&&await independentlyVerifyStableRoster\(before,result\)/);
 assert.match(main,/independentRosterVerified:independentlyStable/);
 assert.match(main,/rows\.length>=MIN_ROWS&&regular>=MIN_REGULAR&&groups>=MIN_GROUPS/);
 assert.match(main,/scrollSweepComplete/);
 assert.match(main,/before!==after/);
});
