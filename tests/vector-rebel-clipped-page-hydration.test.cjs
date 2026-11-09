'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');
const start = source.indexOf('    async function openInspectionForCurrentAsset(run) {');
const end = source.indexOf('        const itemKey =', start);
assert.ok(start >= 0 && end > start, 'Asset identity gate must exist');
const entry = source.slice(start, end);
const makeEntry = new Function(
  'isAssetPageFor', 'location', 'getItemInspectionMode',
  'resolveClippedPpeNameFromVerifiedDetail', 'clean', 'waitFor',
  'verifyExpectedAssetPage', 'stopRun', 'saveRun', 'setStatus',
  entry + '\nreturn item.assetId;\n}\nreturn openInspectionForCurrentAsset;'
);
const original = 'BALDREE-10948322-F...';
const verified = 'BALDREE-10948322-FL';
function runGate(readyAfter) {
  let polls = 0, saved = 0, stopped = 0, verifiedCalls = 0;
  const resolver = () => ++polls >= readyAfter ? verified : '';
  const boundedWait = async fn => {
    for (let n = 0; n < 8; n++) {
      const value = fn();
      if (value) return value;
    }
    throw new Error('No independently verified full name');
  };
  const action = makeEntry(
    () => true, {href: 'https://example.invalid'}, () => ({}),
    resolver, value => String(value || ''), boundedWait,
    async item => { verifiedCalls++; return item.assetId === verified; },
    () => { stopped++; }, () => { saved++; }, () => {}
  );
  const run = {items: [{assetId: original, pool: '300045', itemId: '4604890',
    ownerName: 'Michael Baldree', type: 'Bunker Coat'}], index: 0};
  return {execute: async () => action(run), run,
    metrics: () => ({polls, saved, stopped, verifiedCalls})};
}
test('clipped PPE awaits late identity proof before reaching inspection logic', async () => {
  const h = runGate(3);
  assert.equal(await h.execute(), verified);
  assert.equal(h.run.items[0].assetId, verified);
  assert.deepEqual(h.metrics(), {polls: 3, saved: 1, stopped: 0, verifiedCalls: 1});
});
test('clipped PPE with no independently verified full name still fails closed', async () => {
  const h = runGate(100);
  assert.equal(await h.execute(), undefined);
  assert.equal(h.run.items[0].assetId, original);
  assert.deepEqual(h.metrics(), {polls: 9, saved: 0, stopped: 1, verifiedCalls: 1});
});
