'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');
function extract(start, end) {
  const a = source.indexOf('    ' + start), b = source.indexOf('    ' + end, a + 1);
  assert.ok(a >= 0 && b > a, 'Function boundaries not found');
  return source.slice(a,b);
}
const checkCode = extract('function stoppedRunAlreadyVerifiedInArchive(stoppedRun, archives = null) {',
                          'async function buildPreview(modeKey, ownerInput) {') +
  '\nreturn stoppedRunAlreadyVerifiedInArchive;';
const clean = v => String(v ?? '').trim();
const stop = {
  runId:'ppe-test-1828',modeKey:'tour',startedAt:'2026-10-22T22:07:45.661Z',
  stoppedAt:'2026-10-23T00:06:02Z',items:[{assetId:'GEAR-1'},{assetId:'MASK-2'}],
  index:1,completed:[{assetId:'GEAR-1',evidence:'Item Log'}],
  submittedAt:1792713896123,phase:'stopped'
};
const verified = {
  runId:stop.runId,modeKey:stop.modeKey,startedAt:stop.startedAt,
  completedAt:'2026-10-22T22:13:34.898Z',total:2,
  groups:{'Michael Brion':{items:[
    {assetId:'GEAR-1',evidence:'verified-item-log'},
    {assetId:'MASK-2',evidence:'verified-item-log'}
  ]}}
};
const matcher = new Function('clean','loadJSON','getRunHistory',
  'LAST_SUMMARY_KEY',checkCode)(clean,()=>null,()=>[],'summary');

test('Exact same archived successful run supersedes later stale-tab stopped snapshot',()=>{
  assert.equal(matcher(stop,[verified]),true);
});
test('Different run id, mode, or start time cannot silently clear stopped recovery',()=>{
  assert.equal(matcher(stop,[{...verified,runId:'another'}]),false);
  assert.equal(matcher(stop,[{...verified,modeKey:'captain'}]),false);
  assert.equal(matcher(stop,[{...verified,startedAt:'2026-10-22T22:08:00Z'}]),false);
});
test('Missing final item evidence, skipped item or duplicate item blocks auto-clear',()=>{
  assert.equal(matcher(stop,[{...verified,groups:{crew:{items:[
    {assetId:'GEAR-1',evidence:'yes'},{assetId:'MASK-2',evidence:''}
  ]}}}]),false);
  assert.equal(matcher(stop,[{...verified,groups:{crew:{items:[
    {assetId:'GEAR-1',evidence:'yes'}
  ]}}}]),false);
  assert.equal(matcher(stop,[{...verified,groups:{crew:{items:[
    {assetId:'GEAR-1',evidence:'yes'},{assetId:'GEAR-1',evidence:'yes'}
  ]}}}]),false);
});
test('No archive, invalid stop, or completion predating start cannot clear',()=>{
  assert.equal(matcher(stop,[]),false);
  assert.equal(matcher(null,[verified]),false);
  assert.equal(matcher(stop,[{...verified,completedAt:'2026-10-22T22:00:00Z'}]),false);
});
test('Tour preview clears only a fully matched ghost stop and protects uncertain submits otherwise',()=>{
  const preview=extract('async function buildPreview(modeKey, ownerInput) {',
    'async function launchMyInspectionFromAnywhere(modeKey) {');
  assert.match(preview,/const archivedStop = stoppedRunAlreadyVerifiedInArchive\(stoppedRun\)/);
  assert.match(preview,/if \(archivedStop\) persistentRemoveRaw\(STOPPED_RUN_KEY\)/);
  assert.match(preview,/const stoppedRecent = !archivedStop/);
  assert.match(preview,/Number\.isFinite\(stoppedRun\.submittedAt\)/);
  assert.match(preview,/include\.checked = !protectedAssetIds\.has\(/);
  assert.match(preview,/NEW physical inspection — select all gear/);
  assert.match(preview,/for \(const row of rows\) row\.include\.checked = true/);
  assert.match(preview,/Selecting them again can create duplicate official records/);
  assert.match(preview,/Do not use this to retry an uncertain submission/);
  assert.doesNotMatch(preview,/const archivedStop = true/);
});
