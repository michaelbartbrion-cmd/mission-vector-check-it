'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync(require('node:path').join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const cut=(a,b)=>{
  const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
  assert.ok(i>0&&j>i,a+' .. '+b+' missing');
  return src.slice(i,j);
};
test('asset verification is a required second phase after the daily draft receipt, not a safety shortcut',()=>{
  assert.match(src,/button\('Daily Tour \+ Assets', 'daily'\)/);
  assert.match(src,/button\('Asset Checks', 'assets'\)/);
  const tick=cut('  function tick() {','  // Only capture global errors');
  assert.match(tick,/const followup = readAssetFollowup\(\)/);
  assert.match(tick,/task === TASKS\.daily/);
  assert.ok(tick.indexOf("clean(el.textContent).includes('Saved in Process')")<
    tick.indexOf('task === TASKS.daily'),'must only open assets after actual Save In Process receipt');
  assert.match(tick,/location\.assign\(assetUrl\(followup\.unitId\)\)/);
  assert.match(tick,/No asset has been marked checked by Rebel IQ/);
});
test('direct asset entry is read-only navigation in the existing T504 tab',()=>{
  const begin=cut('  function beginAssets() {','  function begin(kind) {');
  assert.match(begin,/id !== ASSET_UNIT_ID \|\| !t504Visible\(\)/);
  assert.match(begin,/readRopes\(\) \|\| readPending\(\)/);
  assert.match(begin,/location\.assign\(assetUrl\(id\)\)/);
  assert.doesNotMatch(begin,/\.click\(\)|fetch\(|\.post\(/);
});
test('asset followup remembers its target and has a bounded lifetime',()=>{
  const setup=cut("  const ASSET_FOLLOWUP_KEY = 'rebelIqT504DailyAssetFollowupV1';",'  const readPending = () =>');
  assert.match(setup,/ASSET_UNIT_ID = '60443'/);
  assert.match(setup,/inspections\/' \+ id \+ '\/assets\/group\/-1'/);
  assert.match(setup,/Date\.now\(\) - run\.startedAt < 5 \* 60 \* 1000/);
});
test('questionnaire prep still uses Save In Process and avoids official completion',()=>{
  const prep=cut('  async function prepare(kind) {','  async function runPending() {');
  assert.match(prep,/verified\.save\.click\(\)/);
  assert.doesNotMatch(prep,/submit|Submit|Complete Inspection/i);
  assert.match(src,/No asset has been marked checked by Rebel IQ/);
});
test('overview inspection route is recognized without a trailing slash',()=>{
  const line=src.split('\n').find(x=>x.includes('const inspectionId = () =>'));
  assert.ok(line);
  const fn=new Function('location',line+'return inspectionId');
  assert.equal(fn({pathname:'/inspections/60443'})(),'60443');
  assert.equal(fn({pathname:'/inspections/60443/assets/group/-1'})(),'60443');
  assert.equal(fn({pathname:'/inspections/99999'})(),'99999');
  assert.equal(fn({pathname:'/inspections/reports'})(),'');
});