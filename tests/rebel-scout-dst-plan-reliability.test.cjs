'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../beta/rebel-scout.user.js'), 'utf8');
const extract = (from,to) => {
  const start=source.indexOf(from),end=source.indexOf(to,start+from.length);
  assert.ok(start>=0 && end>start,'Expected exact code boundaries for '+from);
  return source.slice(start,end);
};
const dstLogic=extract('function expectedRegularHours(workDate){',
  'if(window.top!==window.self||window.MVCI_REBEL_SCOUT_STAFFING)return;');
const expectedRegularHours=new Function(dstLogic+'\nreturn expectedRegularHours;')();

test('CrewSense 07:00-07:00 tours have the actual elapsed hour count in Chicago',()=>{
  assert.equal(expectedRegularHours('2026-10-31'),25,'Halloween tour spans fall-back Nov 1');
  assert.equal(expectedRegularHours('2026-11-01'),24,'Nov 1 tour itself is 24 hours');
  assert.equal(expectedRegularHours('2026-03-07'),23,'Spring-forward tour is 23 hours');
  assert.equal(expectedRegularHours('2026-03-08'),24,'March 8 tour itself is 24 hours');
  assert.equal(expectedRegularHours('2026-10-22'),24,'Non-transition dates remain 24');
});
test('Staffing census counts the locally correct hours while retaining all other checks',()=>{
  const scrape=extract('async function performScrape(options={}){','function scrapeNow(options={}){');
  assert.match(scrape,/Number\(r\.lengthHours\)===expectedRegularHours\(before\)/);
  assert.match(scrape,/regular>=MIN_REGULAR/);
  assert.match(scrape,/groups>=MIN_GROUPS/);
  assert.match(scrape,/full=\(stableBefore&&stableAfter\|\|independentlyStable\)&&noLoading&&result\.scrollSweepComplete/);
  assert.match(scrape,/body\?\.staffing\?\.quality==='good'/);
});
const retrySource=extract('async function syncPlan(){','const REPORT_COLUMNS=');
function setup(responses){
  const calls=[],statuses=[],waits=[],state={plan:null};
  const core={request:async query=>{
    calls.push(query);
    const next=responses.shift();
    if(next instanceof Error)throw next;
    return next;
  }};
  const api=new Function('core','state','clean','saveStatus','wait',retrySource+
    '\nreturn {syncPlan,syncPlanReliable,retriablePlanError};')(
    core,state,String,(message,kind)=>statuses.push({message,kind}),
    async duration=>{waits.push(duration)}
  );
  return {api,calls,statuses,waits,state};
}
const good={ok:true,worklist:[],summary:{total:0}};
test('Temporary telemetry failure retries only read-only plan GET and then confirms server',async()=>{
  const h=setup([new Error('Telemetry unavailable'),good]);
  const result=await h.api.syncPlanReliable('final freshness');
  assert.deepEqual(result,good);
  assert.equal(h.calls.length,2);
  assert.ok(h.calls.every(x=>x==='?action=range-sync-plan'));
  assert.deepEqual(h.waits,[1200]);
  assert.match(h.statuses[0].message,/retrying read-only status 2\/3/);
});
test('Transient final plan errors stop after three bounded attempts',async()=>{
  const h=setup([new Error('Network timeout'),new Error('Telemetry unavailable'),new Error('HTTP 503')]);
  await assert.rejects(h.api.syncPlanReliable('final freshness'),/HTTP 503/);
  assert.deepEqual(h.waits,[1200,2400]);
  assert.equal(h.calls.length,3);
});
test('Auth or malformed plan errors fail closed without retries',async()=>{
  const auth=setup([new Error('HTTP 401')]);
  await assert.rejects(auth.api.syncPlanReliable('initial'),/HTTP 401/);
  assert.equal(auth.calls.length,1);
  const invalid=setup([{ok:true}]);
  await assert.rejects(invalid.api.syncPlanReliable('final freshness'),/incomplete synchronization plan/);
  assert.equal(invalid.calls.length,1);
});
test('Start and final stages use the retrying GET; never auto-retry writes',()=>{
  const finish=extract('async function finishOrExtend(q){','async function runQueue(){');
  const start=extract('async function startSync(){','function stopSync(){');
  assert.match(finish,/syncPlanReliable\('final freshness'\)/);
  assert.match(start,/syncPlanReliable\('initial'\)/);
  assert.match(source,/async function syncPlan\(\)\{const p=await core\.request\('\?action=range-sync-plan'\)/);
  assert.doesNotMatch(retrySource,/\.post\(/);
  assert.match(finish,/q\.finalServerCheckError=clean\(e\?\.message\|\|e\)/);
});
